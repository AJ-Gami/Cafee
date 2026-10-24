"use client";

import { getSupabase } from "@/lib/supabase/client";
import { monthRange } from "@/lib/format";
import type { Expense, ExpenseCategory, Receipt } from "@/lib/types";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  return check(await getSupabase().from("expense_categories").select("id, user_id, name, icon, sort_order").order("sort_order").order("name"));
}

export async function fetchExpensesBetween(from: string, toExclusive: string): Promise<Expense[]> {
  const rows = check(
    await getSupabase()
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lt("expense_date", toExclusive)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ) as Expense[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function fetchExpensesForMonth(month: string): Promise<Expense[]> {
  const [from, to] = monthRange(month);
  return fetchExpensesBetween(from, to);
}

/** Resit yang belum disahkan (sedang diproses, perlu semakan atau gagal). */
export async function fetchPendingReceipts(): Promise<Receipt[]> {
  return check(
    await getSupabase()
      .from("receipts")
      .select("*")
      .eq("kind", "receipt")
      .in("status", ["processing", "review", "failed"])
      .order("created_at", { ascending: false }),
  ) as Receipt[];
}

export function categoryMap(categories: ExpenseCategory[]): Map<string, ExpenseCategory> {
  return new Map(categories.map((c) => [c.id, c]));
}
