"use client";

import { addMonths, currentMonthKL, formatRM } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";

export type DebtDirection = "i_owe" | "owed_to_me";

export type Debt = {
  id: string;
  direction: DebtDirection;
  name: string;
  whatsapp_number: string | null;
  original_amount: number;
  current_balance: number;
  min_payment: number | null;
  term_years: number | null;
  interest_rate: number | null;
  note: string | null;
  status: "active" | "paid_off";
  created_at: string;
  updated_at: string;
};

export type DebtPayment = {
  id: string;
  debt_id: string;
  paid_date: string;
  amount: number;
  note: string | null;
  created_at: string;
  debt?: { name: string; direction: DebtDirection };
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function normalizeDebt(row: Record<string, unknown>): Debt {
  return {
    ...(row as unknown as Debt),
    original_amount: Number(row.original_amount),
    current_balance: Number(row.current_balance),
    min_payment: num(row.min_payment),
    term_years: num(row.term_years),
    interest_rate: num(row.interest_rate),
  };
}

export async function fetchDebts(direction?: DebtDirection): Promise<Debt[]> {
  let q = getSupabase().from("debts").select("*");
  if (direction) q = q.eq("direction", direction);
  const { data, error } = await q.order("current_balance", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeDebt);
}

export async function fetchDebtPayments(direction?: DebtDirection): Promise<DebtPayment[]> {
  let q = getSupabase().from("debt_payments").select("*, debt:debts!inner(name, direction)");
  if (direction) q = q.eq("debt.direction", direction);
  const { data, error } = await q.order("paid_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...(p as DebtPayment), amount: Number(p.amount) }));
}

/**
 * Streak: bilangan bulan berturut-turut yang ada sekurang-kurangnya satu bayaran.
 * Bulan semasa yang belum ada bayaran tidak memutuskan streak (masih ada masa).
 */
export function paymentStreak(payments: Pick<DebtPayment, "paid_date">[]): number {
  const months = new Set(payments.map((p) => p.paid_date.slice(0, 7)));
  let month = currentMonthKL();
  if (!months.has(month)) month = addMonths(month, -1);
  let streak = 0;
  while (months.has(month)) {
    streak++;
    month = addMonths(month, -1);
  }
  return streak;
}

/** Tukar nombor telefon Malaysia ke format antarabangsa untuk wa.me (01x… -> 601x…). */
export function normalizeMyPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `6${digits}`;
  else if (digits.startsWith("1") && digits.length >= 9 && digits.length <= 10) digits = `60${digits}`;
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

/** Pautan WhatsApp dengan mesej peringatan yang sopan dalam BM. */
export function whatsappReminderUrl(debt: Debt, senderName: string): string | null {
  const phone = normalizeMyPhone(debt.whatsapp_number);
  if (!phone) return null;
  const message = [
    `Salam ${debt.name},`,
    "",
    `Harap sihat selalu. Saya cuma nak ingatkan dengan baik tentang baki pinjaman sebanyak ${formatRM(debt.current_balance)}.`,
    "Kalau ada kelapangan, boleh jelaskan sebahagian atau sepenuhnya. Kalau perlukan masa, beritahu saja ya.",
    "",
    `Terima kasih banyak! 🙏`,
    senderName ? `- ${senderName}` : "",
  ]
    .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
    .join("\n")
    .trim();
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const DIRECTION_LABELS: Record<DebtDirection, { tab: string; paid: string; record: string; add: string }> = {
  i_owe: { tab: "Hutang Saya", paid: "Dah bayar", record: "Catat bayaran", add: "Tambah hutang" },
  owed_to_me: { tab: "Orang Hutang Saya", paid: "Dah terima", record: "Catat terimaan", add: "Tambah pemiutang" },
};
