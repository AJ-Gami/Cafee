"use client";

import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { downloadBlob } from "@/lib/export/download";
import { formatDate, formatRM } from "@/lib/format";
import {
  parseCsvFile,
  templateCsv,
  TEMPLATES,
  validateDebts,
  validateExpenses,
  type DebtImport,
  type ExpenseImport,
  type ImportKind,
  type PreviewRow,
} from "@/lib/importCsv";
import { fetchExpenseCategories } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";

type Preview = { kind: "belanja"; rows: PreviewRow<ExpenseImport>[] } | { kind: "hutang"; rows: PreviewRow<DebtImport>[] };

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("belanja");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = preview ? preview.rows.filter((r) => r.data) : [];
  const invalid = preview ? preview.rows.length - valid.length : 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await parseCsvFile(file);
      if (rows.length === 0) throw new Error("Fail CSV kosong.");
      const missing = TEMPLATES[kind].header.slice(0, 2).filter((h) => !(h in rows[0]!));
      if (missing.length) throw new Error(`Lajur tiada: ${missing.join(", ")}. Guna templat yang disediakan.`);
      setFileName(file.name);
      setPreview(kind === "belanja" ? { kind, rows: validateExpenses(rows, await fetchExpenseCategories()) } : { kind, rows: validateDebts(rows) });
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!preview || valid.length === 0) return error("Tiada baris yang sah untuk diimport.");
    setBusy(true);
    try {
      const supabase = getSupabase();
      const payload: Record<string, unknown>[] =
        preview.kind === "belanja"
          ? preview.rows.flatMap((r) => (r.data ? [{ user_id: userId, expense_date: r.data.expense_date, amount: r.data.amount, merchant: r.data.merchant, category_id: r.data.category_id, note: r.data.note }] : []))
          : preview.rows.flatMap((r) => (r.data ? [{ user_id: userId, ...r.data }] : []));
      const table = preview.kind === "belanja" ? "expenses" : "debts";
      for (let i = 0; i < payload.length; i += 200) {
        const { error: err } = await supabase.from(table).insert(payload.slice(i, i + 200));
        if (err) throw new Error(`Gagal pada baris ${i + 2}–${Math.min(i + 201, payload.length + 1)}: ${err.message}`);
      }
      success(`${payload.length} ${preview.kind === "belanja" ? "belanja" : "hutang"} diimport.`);
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Import CSV"
      onSubmit={preview ? runImport : undefined}
      submitLabel={`Import ${valid.length} baris`}
      submitting={busy}
      submitDisabled={valid.length === 0}
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPreview(null);
            setFileName(null);
          }}
          options={[
            { value: "belanja", label: "Belanja" },
            { value: "hutang", label: "Hutang" },
          ]}
        />
        <button
          type="button"
          onClick={() => downloadBlob(new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" }), TEMPLATES[kind].filename)}
          className="flex items-center gap-3 rounded-2xl border border-line p-3 text-left active:bg-canvas"
        >
          <Download className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block font-semibold">Muat turun templat</span>
            <span className="block truncate text-xs text-muted">Lajur: {TEMPLATES[kind].header.join(", ")}</span>
          </span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line font-semibold text-muted disabled:opacity-60"
        >
          {busy && !preview ? <Spinner className="size-4" /> : <FileUp className="size-5" />}
          {fileName ?? "Pilih fail CSV"}
        </button>
        {kind === "belanja" ? (
          <p className="text-xs text-muted">Tarikh: YYYY-MM-DD atau DD/MM/YYYY. Kategori yang tidak dikenali dimasukkan ke Lain-lain.</p>
        ) : (
          <p className="text-xs text-muted">Jenis: saya_berhutang atau orang_berhutang. Baki kosong = sama dengan jumlah asal.</p>
        )}

        {preview ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                <CheckCircle2 className="size-4" /> {valid.length} sah
              </span>
              {invalid > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                  <AlertTriangle className="size-4" /> {invalid} ralat (dilangkau)
                </span>
              ) : null}
            </div>
            <p className="eyebrow text-muted">Pratonton</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-canvas">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {preview.kind === "belanja" ? (
                      <>
                        <th className="px-2 py-1.5">Tarikh</th>
                        <th className="px-2 py-1.5">Kedai / kategori</th>
                        <th className="px-2 py-1.5 text-right">Jumlah</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-1.5">Nama</th>
                        <th className="px-2 py-1.5">Jenis</th>
                        <th className="px-2 py-1.5 text-right">Baki</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.slice(0, 100).map((r) => (
                    <tr key={r.line} className={r.data ? "" : "bg-red-50"}>
                      <td className="px-2 py-1.5 align-top text-muted">{r.line}</td>
                      {r.data ? (
                        preview.kind === "belanja" ? (
                          <>
                            <td className="px-2 py-1.5 align-top">{formatDate((r.data as ExpenseImport).expense_date)}</td>
                            <td className="px-2 py-1.5 align-top">
                              {(r.data as ExpenseImport).merchant ?? "–"}
                              <span className="block text-muted">{(r.data as ExpenseImport).category_name}</span>
                              {r.warnings.map((w) => (
                                <span key={w} className="block text-amber-700">{w}</span>
                              ))}
                            </td>
                            <td className="px-2 py-1.5 text-right align-top font-semibold">{formatRM((r.data as ExpenseImport).amount)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1.5 align-top">
                              {(r.data as DebtImport).name}
                              {r.warnings.map((w) => (
                                <span key={w} className="block text-amber-700">{w}</span>
                              ))}
                            </td>
                            <td className="px-2 py-1.5 align-top">{(r.data as DebtImport).direction === "i_owe" ? "Saya berhutang" : "Orang berhutang"}</td>
                            <td className="px-2 py-1.5 text-right align-top font-semibold">{formatRM((r.data as DebtImport).current_balance)}</td>
                          </>
                        )
                      ) : (
                        <td colSpan={3} className="px-2 py-1.5 text-red-700">
                          {r.errors.join("; ")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 100 ? <p className="text-xs text-muted">Memaparkan 100 baris pertama daripada {preview.rows.length}.</p> : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
