"use client";

import { parseAmount } from "@/lib/format";
import { normalizeMyPhone, type DebtDirection } from "@/lib/debts";
import type { ExpenseCategory } from "@/lib/types";

export type ImportKind = "belanja" | "hutang";

export const TEMPLATES: Record<ImportKind, { filename: string; header: string[]; examples: string[][] }> = {
  belanja: {
    filename: "templat-belanja.csv",
    header: ["tarikh", "jumlah", "kedai", "kategori", "nota"],
    examples: [
      ["2026-10-01", "12.50", "Restoran Ali", "Makan & Minum", "Makan tengah hari"],
      ["05/10/2026", "89.90", "Mydin", "Barang Dapur", ""],
    ],
  },
  hutang: {
    filename: "templat-hutang.csv",
    header: ["jenis", "nama", "whatsapp", "jumlah_asal", "baki_semasa", "bayaran_minimum", "tempoh_tahun", "faedah_peratus", "nota"],
    examples: [
      ["saya_berhutang", "PTPTN", "", "25000", "18000", "200", "15", "1", ""],
      ["orang_berhutang", "Ali", "0123456789", "500", "300", "", "", "", "Pinjam beli tayar"],
    ],
  },
};

export function templateCsv(kind: ImportKind): string {
  const t = TEMPLATES[kind];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [t.header, ...t.examples].map((row) => row.map(esc).join(",")).join("\n") + "\n";
}

export type PreviewRow<T> = { line: number; data: T | null; errors: string[]; warnings: string[] };

export type ExpenseImport = { expense_date: string; amount: number; merchant: string | null; category_id: string | null; category_name: string; note: string | null };
export type DebtImport = {
  direction: DebtDirection;
  name: string;
  whatsapp_number: string | null;
  original_amount: number;
  current_balance: number;
  min_payment: number | null;
  term_years: number | null;
  interest_rate: number | null;
  note: string | null;
};

/** Terima YYYY-MM-DD atau DD/MM/YYYY (juga D/M/YYYY dan DD-MM-YYYY). */
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeHeaders(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, "_"), (v ?? "").trim()]));
}

export async function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  const Papa = await import("papaparse");
  const text = (await file.text()).replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
  return result.data.map(normalizeHeaders);
}

export function validateExpenses(rows: Record<string, string>[], categories: ExpenseCategory[]): PreviewRow<ExpenseImport>[] {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const fallback = categories.find((c) => c.name === "Lain-lain" && c.user_id === null) ?? null;
  return rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = parseDateInput(r.tarikh ?? "");
    if (!date) errors.push("Tarikh tidak sah");
    const amount = parseAmount(r.jumlah ?? "");
    if (amount === null || amount <= 0) errors.push("Jumlah tidak sah");
    let category = r.kategori ? byName.get(r.kategori.toLowerCase()) : undefined;
    if (!category) {
      if (r.kategori) warnings.push(`Kategori "${r.kategori}" tiada → Lain-lain`);
      category = fallback ?? undefined;
    }
    return {
      line: i + 2,
      errors,
      warnings,
      data: errors.length
        ? null
        : {
            expense_date: date!,
            amount: amount!,
            merchant: r.kedai || null,
            category_id: category?.id ?? null,
            category_name: category?.name ?? "–",
            note: r.nota || null,
          },
    };
  });
}

function directionFrom(input: string): DebtDirection | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "_");
  if (["saya_berhutang", "i_owe", "hutang_saya", "saya"].includes(s)) return "i_owe";
  if (["orang_berhutang", "owed_to_me", "orang_hutang_saya", "orang"].includes(s)) return "owed_to_me";
  return null;
}

export function validateDebts(rows: Record<string, string>[]): PreviewRow<DebtImport>[] {
  return rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const direction = directionFrom(r.jenis ?? "");
    if (!direction) errors.push("Jenis mesti saya_berhutang atau orang_berhutang");
    if (!r.nama) errors.push("Nama diperlukan");
    const original = parseAmount(r.jumlah_asal ?? "");
    if (original === null || original <= 0) errors.push("Jumlah asal tidak sah");
    const balance = r.baki_semasa ? parseAmount(r.baki_semasa) : original;
    if (balance === null || balance < 0) errors.push("Baki semasa tidak sah");
    let phone: string | null = null;
    if (r.whatsapp) {
      phone = normalizeMyPhone(r.whatsapp) ? r.whatsapp : null;
      if (!phone) warnings.push("Nombor WhatsApp tidak sah, diabaikan");
    }
    const optNum = (v: string | undefined) => (v ? (Number.isFinite(Number(v.replace(/[^\d.]/g, ""))) ? Number(v.replace(/[^\d.]/g, "")) : null) : null);
    return {
      line: i + 2,
      errors,
      warnings,
      data: errors.length
        ? null
        : {
            direction: direction!,
            name: r.nama!,
            whatsapp_number: direction === "owed_to_me" ? phone : null,
            original_amount: original!,
            current_balance: balance!,
            min_payment: r.bayaran_minimum ? parseAmount(r.bayaran_minimum) : null,
            term_years: optNum(r.tempoh_tahun),
            interest_rate: optNum(r.faedah_peratus),
            note: r.nota || null,
          },
    };
  });
}
