"use client";

import { AlertCircle, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { ReceiptImage } from "@/components/receipts/ReceiptImage";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button, Field, Input, MoneyInput, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { currentYearKL, formatRM, formatRMShort, parseAmount, round2, todayKL } from "@/lib/format";
import { fetchExpenseCategories } from "@/lib/queries";
import { deleteReceiptCompletely, RECEIPT_DELETE_WARNING } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import { computeTaxUsage, fetchTaxCategories, fetchTaxItems, orderWithChildren, taxOptionLabel } from "@/lib/tax";
import { BENEFICIARY_LABELS, type Beneficiary, type ParsedReceipt, type TaxCategory } from "@/lib/types";
import type { ReceiptBundle } from "./ReceiptReview";

type DraftItem = {
  key: string;
  name: string;
  quantity: string;
  amount: string;
  taxCategoryId: string | null;
  beneficiary: Beneficiary | null;
  aiSuggested: boolean;
  aiConfidence: number | null;
  /** Kategori asal yang dicadangkan AI (untuk tahu jika pengguna mengubahnya). */
  aiCategoryId: string | null;
};

const STATUS_LABEL = { processing: "Sedang dibaca", review: "Perlu disemak", confirmed: "Disahkan", failed: "Gagal dibaca" } as const;

function ocrError(ocr: unknown): string | null {
  if (ocr && typeof ocr === "object" && "error" in ocr) return String((ocr as { error: unknown }).error);
  return null;
}

export function ReviewForm({ bundle, onRescan }: { bundle: ReceiptBundle; onRescan: () => void }) {
  const { receipt, items, expense } = bundle;
  const router = useRouter();
  const { userId } = useSession();
  const { success, error: toastError } = useToast();
  const ocr = (receipt.ocr_json ?? null) as Partial<ParsedReceipt> | null;
  const isStatement = receipt.kind === "statement";
  const vehicleLinked = Boolean(expense?.vehicle_id);

  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [date, setDate] = useState(receipt.receipt_date ?? todayKL());
  const [total, setTotal] = useState(receipt.total_amount != null ? String(receipt.total_amount) : "");
  const [note, setNote] = useState(expense?.note ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category_id ?? null);
  const [drafts, setDrafts] = useState<DraftItem[]>(() =>
    items.map((i) => ({
      key: i.id,
      name: i.name,
      quantity: String(i.quantity),
      amount: String(i.amount),
      taxCategoryId: i.tax_category_id,
      beneficiary: i.beneficiary,
      aiSuggested: i.ai_suggested,
      aiConfidence: i.ai_confidence === null ? null : Number(i.ai_confidence),
      aiCategoryId: i.ai_suggested ? i.tax_category_id : null,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : currentYearKL();
  const { data: expenseCategories } = useData(fetchExpenseCategories, []);
  const { data: taxCategoriesRaw } = useData(() => fetchTaxCategories(year), [year]);
  const taxCategories = useMemo(() => orderWithChildren((taxCategoriesRaw ?? []).filter((c) => c.code !== "ZAKAT")), [taxCategoriesRaw]);
  const taxById = useMemo(() => new Map(taxCategories.map((c) => [c.id, c])), [taxCategories]);

  // Cadangan kategori belanja daripada AI (jika belum ada belanja dipautkan).
  const aiCategoryName = ocr?.expense_category?.toLowerCase() ?? null;
  const suggestedCategoryId =
    (aiCategoryName && expenseCategories?.find((c) => c.name.toLowerCase() === aiCategoryName)?.id) || null;
  const effectiveCategoryId = categoryId ?? suggestedCategoryId;

  const itemsSum = round2(drafts.reduce((s, d) => s + (parseAmount(d.amount) ?? 0), 0));
  const totalValue = parseAmount(total);
  const mismatch = drafts.length > 0 && totalValue !== null && Math.abs(itemsSum - totalValue) > 0.05;

  const updateDraft = (key: string, patch: Partial<DraftItem>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const setItemCategory = (d: DraftItem, id: string | null) => {
    const cat = id ? taxById.get(id) : undefined;
    const allowed = cat?.allowed_beneficiaries ?? [];
    updateDraft(d.key, {
      taxCategoryId: id,
      beneficiary: allowed.length === 1 ? allowed[0]! : d.beneficiary && allowed.includes(d.beneficiary) ? d.beneficiary : null,
    });
  };

  const save = async () => {
    if (totalValue === null || totalValue < 0) return toastError("Masukkan jumlah resit yang sah.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toastError("Pilih tarikh resit.");
    if (!isStatement && !vehicleLinked && !effectiveCategoryId) return toastError("Pilih kategori belanja.");
    for (const d of drafts) {
      const cat = d.taxCategoryId ? taxById.get(d.taxCategoryId) : undefined;
      if (cat && cat.allowed_beneficiaries.length > 1 && !d.beneficiary) {
        return toastError(`Pilih "Untuk siapa?" bagi item ${d.name || "tanpa nama"}.`);
      }
    }

    setSaving(true);
    const supabase = getSupabase();
    try {
      const { error: rErr } = await supabase
        .from("receipts")
        .update({ merchant: merchant.trim() || null, receipt_date: date, total_amount: totalValue, status: "confirmed" })
        .eq("id", receipt.id);
      if (rErr) throw rErr;

      const { error: delErr } = await supabase.from("receipt_items").delete().eq("receipt_id", receipt.id);
      if (delErr) throw delErr;
      const rows = drafts
        .filter((d) => d.name.trim() || parseAmount(d.amount))
        .map((d, index) => {
          const keptAi = d.aiSuggested && d.aiCategoryId === d.taxCategoryId;
          return {
            receipt_id: receipt.id,
            user_id: userId,
            name: d.name.trim() || `Item ${index + 1}`,
            quantity: parseAmount(d.quantity) ?? 1,
            amount: parseAmount(d.amount) ?? 0,
            tax_category_id: d.taxCategoryId,
            beneficiary: d.taxCategoryId ? d.beneficiary : null,
            ai_suggested: keptAi,
            ai_confidence: keptAi ? d.aiConfidence : null,
            sort_order: index,
          };
        });
      if (rows.length) {
        const { error: iErr } = await supabase.from("receipt_items").insert(rows);
        if (iErr) throw iErr;
      }

      if (!isStatement) {
        if (expense) {
          if (!vehicleLinked) {
            const { error: eErr } = await supabase
              .from("expenses")
              .update({ expense_date: date, amount: totalValue, merchant: merchant.trim() || null, category_id: effectiveCategoryId, note: note.trim() || null })
              .eq("id", expense.id);
            if (eErr) throw eErr;
          }
        } else {
          const { error: eErr } = await supabase.from("expenses").insert({
            user_id: userId,
            expense_date: date,
            amount: totalValue,
            merchant: merchant.trim() || null,
            category_id: effectiveCategoryId,
            note: note.trim() || null,
            receipt_id: receipt.id,
          });
          if (eErr) throw eErr;
        }
      }

      success(await savedMessage(rows, taxCategories, year));
      router.push(isStatement ? "/belanja?tab=cukai" : "/belanja");
      router.refresh();
    } catch (e) {
      toastError(errorMessage(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteReceiptCompletely(receipt, { deleteExpense: true });
      success("Resit dipadam.");
      router.push("/belanja");
    } catch (e) {
      toastError(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <main className="pb-24">
      <PageHeader title={isStatement ? "Tuntutan manual" : "Semak resit"} eyebrow={STATUS_LABEL[receipt.status]} back />
      <div className="flex flex-col gap-3 px-4">
        {receipt.status === "failed" ? (
          <Card className="flex flex-col gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>
                {ocrError(receipt.ocr_json) ?? "AI tidak dapat membaca resit ini."} Isi butiran di bawah secara manual, atau cuba
                baca semula.
              </p>
            </div>
            {receipt.file_path ? (
              <Button variant="secondary" className="h-10 text-sm" onClick={onRescan}>
                <RefreshCw className="size-4" /> Cuba baca semula
              </Button>
            ) : null}
          </Card>
        ) : receipt.status === "review" ? (
          <Card className="flex gap-2 border-accent bg-accent-soft p-3 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <p>Dibaca oleh AI. Semak kedai, tarikh, jumlah dan kategori cukai sebelum simpan.</p>
          </Card>
        ) : null}

        {receipt.file_path ? <ReceiptImage path={receipt.file_path} fileType={receipt.file_type} className="h-60" /> : null}

        <Card className="flex flex-col gap-4 p-4">
          <Field label={isStatement ? "Institusi / penerangan" : "Kedai"} htmlFor="r-merchant">
            <Input id="r-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Nama kedai" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarikh" htmlFor="r-date">
              <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Jumlah" htmlFor="r-total">
              <MoneyInput id="r-total" value={total} onChange={setTotal} />
            </Field>
          </div>
          {!isStatement ? (
            vehicleLinked ? (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Belanja untuk resit ini diurus melalui rekod kenderaan.
              </p>
            ) : (
              <>
                <Field
                  label="Kategori belanja"
                  htmlFor="r-category"
                  hint={!categoryId && suggestedCategoryId ? "Dicadangkan oleh AI." : undefined}
                >
                  <Select id="r-category" value={effectiveCategoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || null)}>
                    <option value="">Pilih kategori…</option>
                    {(expenseCategories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nota" htmlFor="r-note">
                  <Input id="r-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilihan" />
                </Field>
              </>
            )
          ) : null}
        </Card>

        <div className="flex items-baseline justify-between px-1 pt-2">
          <h2 className="font-bold">Item ({drafts.length})</h2>
          <span className={`text-sm ${mismatch ? "font-semibold text-amber-700" : "text-muted"}`}>Jumlah item {formatRM(itemsSum)}</span>
        </div>
        {mismatch ? (
          <p className="-mt-1 px-1 text-xs text-amber-700">
            Jumlah item berbeza daripada jumlah resit ({formatRM(totalValue)}). Ini biasa jika ada cukai, diskaun atau pembundaran.
          </p>
        ) : null}

        {drafts.map((d, index) => {
          const cat = d.taxCategoryId ? taxById.get(d.taxCategoryId) : undefined;
          const showAi = d.aiSuggested && d.aiCategoryId === d.taxCategoryId && d.taxCategoryId;
          return (
            <Card key={d.key} className="flex flex-col gap-3 p-3">
              <div className="flex items-start gap-2">
                <Input
                  aria-label={`Nama item ${index + 1}`}
                  value={d.name}
                  onChange={(e) => updateDraft(d.key, { name: e.target.value })}
                  className="h-10 flex-1"
                  placeholder="Nama item"
                />
                <button
                  type="button"
                  aria-label="Buang item"
                  onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-muted active:bg-canvas"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <Input
                  aria-label="Kuantiti"
                  inputMode="decimal"
                  value={d.quantity}
                  onChange={(e) => updateDraft(d.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                  className="h-10 text-center"
                />
                <MoneyInput value={d.amount} onChange={(v) => updateDraft(d.key, { amount: v })} />
              </div>
              {taxCategories.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">Kategori cukai</span>
                    {showAi ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold">
                        <Sparkles className="size-3" /> Cadangan AI{d.aiConfidence !== null ? ` · ${Math.round(d.aiConfidence * 100)}%` : ""}
                      </span>
                    ) : null}
                  </div>
                  <Select
                    aria-label="Kategori cukai"
                    value={d.taxCategoryId ?? ""}
                    onChange={(e) => setItemCategory(d, e.target.value || null)}
                    className="h-10 text-sm"
                  >
                    <option value="">Tiada</option>
                    {taxCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {taxOptionLabel(c, taxCategories)}
                      </option>
                    ))}
                  </Select>
                  {cat && cat.allowed_beneficiaries.length > 1 ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold">Untuk siapa?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.allowed_beneficiaries.map((b) => (
                          <button
                            key={b}
                            type="button"
                            aria-pressed={d.beneficiary === b}
                            onClick={() => updateDraft(d.key, { beneficiary: b })}
                            className={`h-8 rounded-full border px-3 text-xs font-semibold ${
                              d.beneficiary === b ? "border-ink bg-ink text-white" : "border-line bg-white"
                            }`}
                          >
                            {BENEFICIARY_LABELS[b]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}

        <Button
          variant="secondary"
          onClick={() =>
            setDrafts((list) => [
              ...list,
              {
                key: crypto.randomUUID(),
                name: "",
                quantity: "1",
                amount: "",
                taxCategoryId: null,
                beneficiary: null,
                aiSuggested: false,
                aiConfidence: null,
                aiCategoryId: null,
              },
            ])
          }
        >
          <Plus className="size-4" /> Tambah item
        </Button>
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-[45] mx-auto flex max-w-[480px] gap-3 border-t border-line bg-white px-4 pt-3">
        <div className="flex w-full gap-3 pb-3">
          <Button variant="danger" aria-label="Padam resit" className="w-12 shrink-0 px-0" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" />
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Spinner className="size-4" /> : null}
            Simpan
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Padam resit ini?"
        message={
          <>
            <span className="block font-semibold text-red-700">{RECEIPT_DELETE_WARNING}</span>
            {expense && !vehicleLinked ? <span className="mt-1 block">Belanja yang dipautkan juga akan dipadam.</span> : null}
          </>
        }
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </main>
  );
}

/** Mesej toast selepas simpan, contohnya "Disimpan. Gaya hidup: RM 1,240 / RM 2,500 digunakan". */
async function savedMessage(
  rows: { tax_category_id: string | null; amount: number }[],
  taxCategories: TaxCategory[],
  year: number,
): Promise<string> {
  const amounts = new Map<string, number>();
  for (const r of rows) if (r.tax_category_id) amounts.set(r.tax_category_id, (amounts.get(r.tax_category_id) ?? 0) + r.amount);
  const topId = [...amounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topId) return "Disimpan.";
  try {
    const summary = computeTaxUsage(taxCategories, await fetchTaxItems(year));
    const usage = summary.byId.get(topId);
    if (!usage) return "Disimpan.";
    const cap = usage.category.cap_amount;
    return cap !== null
      ? `Disimpan. ${usage.category.name}: ${formatRMShort(round2(usage.used))} / ${formatRMShort(cap)} digunakan`
      : `Disimpan. ${usage.category.name}: ${formatRMShort(round2(usage.used))} setakat ini`;
  } catch {
    return "Disimpan.";
  }
}
