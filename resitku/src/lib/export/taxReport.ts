"use client";

import { getSupabase } from "@/lib/supabase/client";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { computeTaxUsage, fetchTaxCategories, fetchTaxItems, orderWithChildren, type TaxItemRow } from "@/lib/tax";
import { BENEFICIARY_LABELS, type TaxCategory } from "@/lib/types";
import { downloadBlob, safeName } from "./download";

type ZakatRow = { paid_date: string; amount: number; type: string; institution: string | null; receipt_id: string | null };

async function loadReportData(year: number) {
  const [categories, items, zakatRes] = await Promise.all([
    fetchTaxCategories(year),
    fetchTaxItems(year),
    getSupabase()
      .from("zakat_payments")
      .select("paid_date, amount, type, institution, receipt_id")
      .gte("paid_date", `${year}-01-01`)
      .lte("paid_date", `${year}-12-31`)
      .order("paid_date"),
  ]);
  if (zakatRes.error) throw new Error(zakatRes.error.message);
  const zakat = (zakatRes.data ?? []).map((z) => ({ ...(z as ZakatRow), amount: Number(z.amount) }));
  const zakatTotal = zakat.reduce((s, z) => s + z.amount, 0);
  return { categories, items, zakat, summary: computeTaxUsage(categories, items, zakatTotal) };
}

/** PDF ringkasan tahun taksiran: jumlah ikut kategori (susunan e-Filing), senarai resit, zakat. */
export async function exportTaxPdf(year: number, displayName: string) {
  const [{ jsPDF }, { autoTable }, data] = await Promise.all([import("jspdf"), import("jspdf-autotable"), loadReportData(year)]);
  const { categories, items, zakat, summary } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 20;
  const ink: [number, number, number] = [17, 24, 39];
  const navy: [number, number, number] = [30, 58, 95];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ink);
  doc.text(`Ringkasan Pelepasan Cukai - Tahun Taksiran ${year}`, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`${displayName} · Dijana oleh ResitKu pada ${formatDate(todayKL())}`, 14, 24);
  doc.text("Panduan sahaja. Semak had dan syarat terkini dengan borang BE / e-Filing LHDN.", 14, 29);

  const ordered = orderWithChildren(categories);
  autoTable(doc, {
    startY: 34,
    head: [["Kategori", "Digunakan", "Had", "Boleh dituntut"]],
    body: ordered.map((c) => {
      const u = summary.byId.get(c.id);
      const isChild = Boolean(c.parent_id);
      return [
        `${isChild ? "   - " : ""}${c.name}${c.type !== "relief" ? (c.type === "rebate" ? " (rebat)" : " (potongan)") : ""}`,
        formatRM(u?.used ?? 0),
        c.cap_amount !== null ? formatRM(c.cap_amount) : "Tiada had",
        isChild ? "(dalam induk)" : formatRM(u?.claimable ?? 0),
      ];
    }),
    foot: [
      ["Jumlah pelepasan", "", "", formatRM(summary.reliefTotal)],
      ["Jumlah potongan", "", "", formatRM(summary.deductionTotal)],
      ["Jumlah rebat (zakat, levi)", "", "", formatRM(summary.rebateTotal)],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: navy },
    footStyles: { fillColor: [246, 247, 249], textColor: ink, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  const catById = new Map(categories.map((c) => [c.id, c]));
  const sortedItems = [...items].sort((a, b) => (a.receipt.receipt_date ?? "").localeCompare(b.receipt.receipt_date ?? ""));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...ink);
  doc.text("Senarai resit", 14, finalY() + 10);
  autoTable(doc, {
    startY: finalY() + 13,
    head: [["Tarikh", "Kedai", "Item", "Kategori", "Penerima", "Jumlah"]],
    body: sortedItems.length
      ? sortedItems.map((i) => [
          formatDate(i.receipt.receipt_date),
          i.receipt.merchant ?? "-",
          i.name,
          catById.get(i.tax_category_id)?.name ?? "-",
          i.beneficiary ? BENEFICIARY_LABELS[i.beneficiary] : "-",
          formatRM(i.amount),
        ])
      : [["-", "Tiada resit bertanda kategori cukai", "", "", "", ""]],
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: navy },
    columnStyles: { 5: { halign: "right" } },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Zakat & fitrah", 14, finalY() + 10);
  autoTable(doc, {
    startY: finalY() + 13,
    head: [["Tarikh", "Jenis", "Institusi", "Jumlah"]],
    body: zakat.length
      ? zakat.map((z) => [formatDate(z.paid_date), z.type === "fitrah" ? "Fitrah" : "Zakat", z.institution ?? "-", formatRM(z.amount)])
      : [["-", "Tiada rekod", "", ""]],
    foot: [["Jumlah zakat", "", "", formatRM(summary.zakatTotal)]],
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: navy },
    footStyles: { fillColor: [246, 247, 249], textColor: ink, fontStyle: "bold" },
    columnStyles: { 3: { halign: "right" } },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Halaman ${p} / ${pages}`, 196, 290, { align: "right" });
  }
  downloadBlob(doc.output("blob"), `ResitKu-Cukai-YA${year}.pdf`);
}

/**
 * ZIP semua gambar/PDF resit tahun taksiran, disusun dalam folder ikut kategori cukai.
 * Resit dengan item dalam beberapa kategori disalin ke setiap folder berkenaan.
 */
export async function exportTaxZip(year: number, onProgress?: (done: number, total: number) => void): Promise<number> {
  const supabase = getSupabase();
  const [{ default: JSZip }, categories, receiptsRes, items, zakatRes] = await Promise.all([
    import("jszip"),
    fetchTaxCategories(year, { includeInactive: true }),
    supabase
      .from("receipts")
      .select("id, merchant, receipt_date, file_path, file_type, kind")
      .eq("assessment_year", year)
      .eq("status", "confirmed")
      .not("file_path", "is", null),
    fetchTaxItems(year),
    supabase.from("zakat_payments").select("receipt_id").not("receipt_id", "is", null),
  ]);
  if (receiptsRes.error) throw new Error(receiptsRes.error.message);
  const receipts = receiptsRes.data ?? [];
  if (receipts.length === 0) return 0;

  const catById = new Map<string, TaxCategory>(categories.map((c) => [c.id, c]));
  const catsByReceipt = new Map<string, Set<string>>();
  for (const item of items as TaxItemRow[]) {
    const name = catById.get(item.tax_category_id)?.name ?? "Lain-lain";
    catsByReceipt.set(item.receipt_id, (catsByReceipt.get(item.receipt_id) ?? new Set()).add(name));
  }
  for (const z of zakatRes.data ?? []) {
    if (z.receipt_id) catsByReceipt.set(z.receipt_id, (catsByReceipt.get(z.receipt_id) ?? new Set()).add("Zakat & fitrah"));
  }

  const zip = new JSZip();
  const paths = receipts.map((r) => r.file_path as string);
  const signed = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrls(paths.slice(i, i + 100), 600);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  let done = 0;
  onProgress?.(0, receipts.length);
  const queue = [...receipts];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const url = signed.get(r.file_path as string);
      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const ext = (r.file_path as string).split(".").pop() ?? (r.file_type === "pdf" ? "pdf" : "jpg");
          const fileName = `${r.receipt_date ?? "tanpa-tarikh"}_${safeName(r.merchant ?? "resit", 40)}_${String(r.id).slice(0, 6)}.${ext}`;
          const folders = [...(catsByReceipt.get(r.id) ?? new Set(["Tiada kategori cukai"]))];
          for (const folder of folders) zip.file(`${safeName(folder)}/${fileName}`, blob);
        }
      }
      onProgress?.(++done, receipts.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const out = await zip.generateAsync({ type: "blob" });
  downloadBlob(out, `ResitKu-Resit-YA${year}.zip`);
  return receipts.length;
}
