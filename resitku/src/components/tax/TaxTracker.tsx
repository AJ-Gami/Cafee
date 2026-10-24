"use client";

import { Archive, FileDown, Landmark, Plus } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Select } from "@/components/ui/Field";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { formatRM } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { computeTaxUsage, fetchTaxCategories, fetchTaxItems, fetchZakatTotal } from "@/lib/tax";
import { TaxCategoryCard } from "./TaxCategoryCard";

export async function fetchTaxYears(): Promise<number[]> {
  const { data, error } = await getSupabase().from("tax_relief_categories").select("assessment_year");
  if (error) return [];
  return [...new Set((data ?? []).map((r) => Number(r.assessment_year)))].sort((a, b) => b - a);
}

export async function loadTaxSummary(year: number) {
  const [categories, items, zakatTotal] = await Promise.all([fetchTaxCategories(year), fetchTaxItems(year), fetchZakatTotal(year)]);
  return { categories, summary: computeTaxUsage(categories, items, zakatTotal) };
}

export function TaxTracker({
  year,
  onYearChange,
  version,
  onAddZakat,
}: {
  year: number;
  onYearChange: (y: number) => void;
  version: number;
  onAddZakat: () => void;
}) {
  const { displayName } = useSession();
  const { success, error, toast } = useToast();
  const { data: years } = useData(fetchTaxYears, []);
  const { data, loading, error: loadError, reload } = useData(() => loadTaxSummary(year), [year, version]);
  const [exporting, setExporting] = useState<"pdf" | "zip" | null>(null);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const yearOptions = [...new Set([...(years ?? []), year])].sort((a, b) => b - a);

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const { exportTaxPdf } = await import("@/lib/export/taxReport");
      await exportTaxPdf(year, displayName);
      success("PDF ringkasan dimuat turun.");
    } catch (e) {
      error(`Gagal menjana PDF: ${errorMessage(e)}`);
    } finally {
      setExporting(null);
    }
  };

  const exportZip = async () => {
    setExporting("zip");
    try {
      const { exportTaxZip } = await import("@/lib/export/taxReport");
      const count = await exportTaxZip(year, (done, total) => setZipProgress(`${done}/${total}`));
      if (count === 0) toast(`Tiada fail resit untuk YA ${year}.`);
      else success(`${count} resit dimuat turun dalam ZIP.`);
    } catch (e) {
      error(`Gagal menjana ZIP: ${errorMessage(e)}`);
    } finally {
      setExporting(null);
      setZipProgress(null);
    }
  };

  const summary = data?.summary;
  const reliefRows = summary?.rows.filter((r) => r.category.type === "relief") ?? [];
  const deductionRows = summary?.rows.filter((r) => r.category.type === "deduction") ?? [];
  const rebateRows = summary?.rows.filter((r) => r.category.type === "rebate") ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="tax-year" className="text-sm font-semibold">
          Tahun taksiran
        </label>
        <Select id="tax-year" value={year} onChange={(e) => onYearChange(Number(e.target.value))} className="h-10 flex-1">
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              YA {y}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <>
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </>
      ) : loadError ? (
        <EmptyState icon={Landmark} title="Gagal memuatkan" text={loadError} action={<Button onClick={reload}>Cuba lagi</Button>} />
      ) : !data || data.categories.length === 0 ? (
        <EmptyState icon={Landmark} title={`Kategori YA ${year} belum tersedia`} text="Admin perlu menambah atau menyalin kategori pelepasan cukai untuk tahun ini." />
      ) : (
        <>
          <div className="rounded-2xl bg-tax p-4 text-white">
            <p className="eyebrow text-white/70">Boleh dituntut setakat ini</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">{formatRM(summary!.reliefTotal)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="eyebrow text-white/60">Potongan</p>
                <p className="font-bold">{formatRM(summary!.deductionTotal)}</p>
              </div>
              <div>
                <p className="eyebrow text-white/60">Rebat zakat</p>
                <p className="font-bold">{formatRM(summary!.zakatTotal)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={exportPdf}
                disabled={exporting !== null}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-semibold active:bg-white/25 disabled:opacity-60"
              >
                {exporting === "pdf" ? <Spinner className="size-4" /> : <FileDown className="size-4" />} PDF ringkasan
              </button>
              <button
                type="button"
                onClick={exportZip}
                disabled={exporting !== null}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-semibold active:bg-white/25 disabled:opacity-60"
              >
                {exporting === "zip" ? <Spinner className="size-4" /> : <Archive className="size-4" />}
                {zipProgress ? `ZIP ${zipProgress}` : "ZIP resit"}
              </button>
            </div>
          </div>

          <h2 className="eyebrow px-1 pt-2 text-muted">Pelepasan</h2>
          {reliefRows.map((u) => (
            <TaxCategoryCard key={u.category.id} usage={u} year={year} />
          ))}

          {deductionRows.length > 0 ? <h2 className="eyebrow px-1 pt-2 text-muted">Potongan</h2> : null}
          {deductionRows.map((u) => (
            <TaxCategoryCard key={u.category.id} usage={u} year={year} />
          ))}

          {rebateRows.length > 0 ? <h2 className="eyebrow px-1 pt-2 text-muted">Rebat</h2> : null}
          {rebateRows.map((u) => (
            <TaxCategoryCard key={u.category.id} usage={u} year={year} />
          ))}
          <Button variant="secondary" onClick={onAddZakat}>
            <Plus className="size-4" /> Rekod zakat / fitrah
          </Button>

          <p className="px-1 pb-2 pt-1 text-xs text-muted">
            Had dan kategori berdasarkan ringkasan pihak ketiga; borang BE YA {year} rasmi mungkin berbeza. Setiap item hanya
            boleh berada dalam satu kategori untuk mengelakkan tuntutan berganda.
          </p>
        </>
      )}
    </div>
  );
}
