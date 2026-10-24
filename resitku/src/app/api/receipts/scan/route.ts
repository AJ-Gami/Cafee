import { NextResponse, type NextRequest } from "next/server";
import { parseReceipt, ReceiptParseError, type TaxCategoryHint } from "@/lib/ai/receiptParser";
import { currentYearKL } from "@/lib/format";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";
import type { ParsedReceipt } from "@/lib/types";

export const maxDuration = 60;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mediaTypeFor(path: string, fileType: string | null): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (fileType === "pdf" || ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

async function loadTaxCategories(supabase: SupabaseServer, year: number) {
  const { data, error } = await supabase
    .from("tax_relief_categories")
    .select("id, code, name, description, keywords, allowed_beneficiaries, notes, type")
    .eq("assessment_year", year)
    .eq("is_active", true)
    .order("sort_order");
  if (error || !data) return [];
  return data as (TaxCategoryHint & { id: string; type: string })[];
}

/**
 * POST /api/receipts/scan  { receiptId }
 * Ambil fail resit dari Storage, minta AI membacanya, simpan hasil dan item cadangan.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sila log masuk semula.", 401);

  const body = (await request.json().catch(() => null)) as { receiptId?: string } | null;
  const receiptId = body?.receiptId;
  if (!receiptId) return fail("receiptId diperlukan.", 400);

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  if (!(await canUse("receipt_scan", { plan: profile?.plan }))) return fail(LIMIT_MESSAGE, 402);

  const { data: receipt, error: receiptError } = await supabase.from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (receiptError || !receipt) return fail("Resit tidak dijumpai.", 404);
  if (!receipt.file_path) return fail("Resit ini tiada fail untuk dibaca.", 400);

  await supabase.from("receipts").update({ status: "processing" }).eq("id", receiptId);

  const markFailed = async (message: string, detail?: string) => {
    await supabase
      .from("receipts")
      .update({ status: "failed", ocr_json: { error: message, detail: detail ?? null, at: new Date().toISOString() } })
      .eq("id", receiptId);
  };

  const download = await supabase.storage.from("receipts").download(receipt.file_path);
  if (download.error || !download.data) {
    await markFailed("Fail resit tidak dapat dibaca dari storan.", download.error?.message);
    return fail("Fail resit tidak dapat dibaca dari storan.", 500);
  }
  const file = Buffer.from(await download.data.arrayBuffer());

  const promptYear = receipt.assessment_year ?? currentYearKL();
  const [taxCategories, { data: expenseCats }] = await Promise.all([
    loadTaxCategories(supabase, promptYear),
    supabase.from("expense_categories").select("name").order("sort_order"),
  ]);

  let parsed: ParsedReceipt;
  let meta: { model: string; usage: { input_tokens: number; output_tokens: number } };
  try {
    const result = await parseReceipt({
      file,
      mediaType: mediaTypeFor(receipt.file_path, receipt.file_type),
      assessmentYear: promptYear,
      // Zakat direkod melalui is_zakat (jadual zakat_payments), bukan sebagai item.
      taxCategories: taxCategories.filter((c) => c.code !== "ZAKAT"),
      expenseCategories: (expenseCats ?? []).map((c) => c.name as string),
    });
    parsed = result.receipt;
    meta = { model: result.model, usage: result.usage };
  } catch (err) {
    const userMessage = err instanceof ReceiptParseError ? err.userMessage : "AI gagal membaca resit. Cuba lagi atau isi secara manual.";
    console.error("[scan] gagal", err);
    await markFailed(userMessage, err instanceof Error ? err.message : String(err));
    return fail(userMessage, 502);
  }

  // Kira penggunaan (Fasa 7 + pantau kos API). Kegagalan kiraan tidak menghalang pengguna.
  await supabase.rpc("increment_ai_scan");

  // Petakan kod cukai -> id untuk tahun tarikh resit (jika berbeza daripada tahun prompt).
  const receiptYear = parsed.date ? Number(parsed.date.slice(0, 4)) : promptYear;
  const yearCategories = receiptYear === promptYear ? taxCategories : await loadTaxCategories(supabase, receiptYear);
  const codeToId = new Map(yearCategories.map((c) => [c.code, c.id]));

  const { error: updateError } = await supabase
    .from("receipts")
    .update({
      merchant: parsed.merchant,
      receipt_date: parsed.date,
      total_amount: parsed.total ?? parsed.items.reduce((sum, i) => sum + i.amount, 0),
      ocr_json: { ...parsed, _meta: { ...meta, scanned_at: new Date().toISOString() } },
      status: "review",
    })
    .eq("id", receiptId);
  if (updateError) return fail("Gagal menyimpan hasil bacaan.", 500);

  await supabase.from("receipt_items").delete().eq("receipt_id", receiptId);
  if (parsed.items.length > 0) {
    await supabase.from("receipt_items").insert(
      parsed.items.map((item, index) => {
        const taxId = item.tax_category_code ? (codeToId.get(item.tax_category_code) ?? null) : null;
        return {
          receipt_id: receiptId,
          user_id: user.id,
          name: item.name || `Item ${index + 1}`,
          quantity: item.quantity,
          amount: item.amount,
          tax_category_id: taxId,
          ai_suggested: taxId !== null,
          ai_confidence: taxId !== null ? item.confidence : null,
          sort_order: index,
        };
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
