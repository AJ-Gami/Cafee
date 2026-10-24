"use client";

import { getSupabase } from "@/lib/supabase/client";
import type { Beneficiary, TaxCategory } from "@/lib/types";

export type TaxItemRow = {
  id: string;
  name: string;
  amount: number;
  tax_category_id: string;
  beneficiary: Beneficiary | null;
  receipt_id: string;
  receipt: {
    id: string;
    merchant: string | null;
    receipt_date: string | null;
    kind: "receipt" | "statement";
    file_path: string | null;
    file_type: "image" | "pdf" | null;
  };
};

export type TaxUsage = {
  category: TaxCategory;
  /** Jumlah item yang ditanda terus pada kategori ini. */
  own: number;
  /** Digunakan: untuk induk = item sendiri + jumlah sub-had yang boleh dituntut. */
  used: number;
  /** Jumlah boleh dituntut selepas had. */
  claimable: number;
  /** Lebihan melebihi had (tidak boleh dituntut). */
  excess: number;
  receiptCount: number;
  children: TaxUsage[];
};

export type TaxSummary = {
  rows: TaxUsage[];
  byId: Map<string, TaxUsage>;
  reliefTotal: number;
  deductionTotal: number;
  rebateTotal: number;
  zakatTotal: number;
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeTaxCategory(row: Record<string, unknown>): TaxCategory {
  return {
    ...(row as unknown as TaxCategory),
    cap_amount: row.cap_amount === null || row.cap_amount === undefined ? null : toNumber(row.cap_amount),
    allowed_beneficiaries: (row.allowed_beneficiaries as Beneficiary[] | null) ?? [],
    keywords: (row.keywords as string[] | null) ?? [],
  };
}

/** Kategori cukai untuk satu tahun taksiran (aktif sahaja secara lalai). Kosong jika jadual belum wujud. */
export async function fetchTaxCategories(year: number, opts: { includeInactive?: boolean } = {}): Promise<TaxCategory[]> {
  let query = getSupabase().from("tax_relief_categories").select("*").eq("assessment_year", year);
  if (!opts.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("sort_order");
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => normalizeTaxCategory(r));
}

/** Semua item bertanda kategori cukai daripada resit yang disahkan untuk tahun taksiran. */
export async function fetchTaxItems(year: number): Promise<TaxItemRow[]> {
  const { data, error } = await getSupabase()
    .from("receipt_items")
    .select("id, name, amount, tax_category_id, beneficiary, receipt_id, receipt:receipts!inner(id, merchant, receipt_date, kind, file_path, file_type, status, assessment_year)")
    .not("tax_category_id", "is", null)
    .eq("receipt.assessment_year", year)
    .eq("receipt.status", "confirmed");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...(r as unknown as TaxItemRow), amount: toNumber(r.amount) }));
}

export async function fetchZakatTotal(year: number): Promise<number> {
  const { data, error } = await getSupabase()
    .from("zakat_payments")
    .select("amount")
    .gte("paid_date", `${year}-01-01`)
    .lte("paid_date", `${year}-12-31`);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return (data ?? []).reduce((s, r) => s + toNumber(r.amount), 0);
}

function capped(value: number, cap: number | null) {
  return cap === null ? value : Math.min(value, cap);
}

/**
 * Kira penggunaan setiap kategori. Sub-had dikira dalam had induk: induk menerima jumlah sub-had
 * yang boleh dituntut (selepas had sub), ditambah item yang ditanda terus pada induk.
 */
export function computeTaxUsage(categories: TaxCategory[], items: TaxItemRow[], zakatTotal = 0): TaxSummary {
  const ownMap = new Map<string, number>();
  const receiptsMap = new Map<string, Set<string>>();
  for (const item of items) {
    ownMap.set(item.tax_category_id, (ownMap.get(item.tax_category_id) ?? 0) + item.amount);
    const set = receiptsMap.get(item.tax_category_id) ?? new Set<string>();
    set.add(item.receipt_id);
    receiptsMap.set(item.tax_category_id, set);
  }

  const byId = new Map<string, TaxUsage>();
  const childrenOf = new Map<string, TaxCategory[]>();
  for (const c of categories) {
    if (c.parent_id) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c]);
  }

  const build = (c: TaxCategory): TaxUsage => {
    const own = c.code === "ZAKAT" ? zakatTotal : (ownMap.get(c.id) ?? 0);
    const children = (childrenOf.get(c.id) ?? []).map(build);
    const used = own + children.reduce((s, ch) => s + ch.claimable, 0);
    const claimable = capped(used, c.cap_amount);
    const receipts = new Set<string>(receiptsMap.get(c.id) ?? []);
    for (const ch of childrenOf.get(c.id) ?? []) for (const r of receiptsMap.get(ch.id) ?? []) receipts.add(r);
    const usage: TaxUsage = {
      category: c,
      own,
      used,
      claimable,
      excess: Math.max(0, used - claimable),
      receiptCount: receipts.size,
      children,
    };
    byId.set(c.id, usage);
    return usage;
  };

  const ids = new Set(categories.map((c) => c.id));
  const rows = categories.filter((c) => !c.parent_id || !ids.has(c.parent_id)).map(build);
  const sumType = (type: TaxCategory["type"]) => rows.filter((r) => r.category.type === type).reduce((s, r) => s + r.claimable, 0);

  return {
    rows,
    byId,
    reliefTotal: sumType("relief"),
    deductionTotal: sumType("deduction"),
    rebateTotal: sumType("rebate"),
    zakatTotal,
  };
}

/** Label pilihan kategori cukai untuk dropdown (sub-had diindentasi). */
export function taxOptionLabel(c: TaxCategory, all: TaxCategory[]): string {
  const cap = c.cap_amount !== null ? ` (had RM${c.cap_amount.toLocaleString("en-MY")})` : "";
  return c.parent_id && all.some((p) => p.id === c.parent_id) ? `↳ ${c.name}${cap}` : `${c.name}${cap}`;
}

/** Susun kategori: induk diikuti sub-hadnya. */
export function orderWithChildren(categories: TaxCategory[]): TaxCategory[] {
  const ids = new Set(categories.map((c) => c.id));
  const tops = categories.filter((c) => !c.parent_id || !ids.has(c.parent_id));
  return tops.flatMap((t) => [t, ...categories.filter((c) => c.parent_id === t.id)]);
}
