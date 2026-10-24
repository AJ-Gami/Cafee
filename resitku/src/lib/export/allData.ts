"use client";

import { getSupabase } from "@/lib/supabase/client";
import { todayKL } from "@/lib/format";
import { downloadBlob } from "./download";

const TABLES = [
  "profiles",
  "expense_categories",
  "expenses",
  "receipts",
  "receipt_items",
  "zakat_payments",
  "debts",
  "debt_payments",
  "vehicles",
  "vehicle_services",
  "fuel_logs",
  "link_folders",
  "links",
  "ai_usage",
] as const;

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = getSupabase().from(table).select("*").range(from, from + pageSize - 1);
    // Kategori sistem dikongsi semua pengguna; eksport kategori sendiri sahaja.
    if (table === "expense_categories") q = q.not("user_id", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** ZIP mengandungi satu CSV bagi setiap jadual milik pengguna. */
export async function exportAllData(onProgress?: (table: string) => void) {
  const [{ default: JSZip }, Papa] = await Promise.all([import("jszip"), import("papaparse")]);
  const zip = new JSZip();
  const counts: string[] = [];
  for (const table of TABLES) {
    onProgress?.(table);
    const rows = await fetchAll(table);
    const normalized = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])),
    );
    const csv = normalized.length ? Papa.unparse(normalized) : "";
    zip.file(`${table}.csv`, `﻿${csv}`);
    counts.push(`${table}.csv: ${rows.length} baris`);
  }
  zip.file(
    "BACA-SAYA.txt",
    [
      "Eksport data ResitKu",
      `Tarikh: ${todayKL()}`,
      "",
      "Setiap fail CSV mewakili satu jadual. Gambar resit tidak termasuk; guna eksport ZIP resit dalam tracker cukai.",
      "",
      ...counts,
    ].join("\n"),
  );
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `ResitKu-Data-${todayKL()}.zip`);
}
