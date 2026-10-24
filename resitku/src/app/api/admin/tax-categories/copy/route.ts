import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminGuard";

const schema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  toYear: z.number().int().min(2000).max(2100),
});

/** POST: salin semua kategori dari satu tahun taksiran ke tahun baharu (termasuk sub-had). */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tahun tidak sah." }, { status: 400 });
  const { data, error } = await guard.admin.rpc("copy_tax_categories", { p_from: parsed.data.fromYear, p_to: parsed.data.toYear });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ copied: data as number });
}
