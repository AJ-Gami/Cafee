"use client";

import { ChevronRight, Landmark } from "lucide-react";
import Link from "next/link";
import { loadTaxSummary } from "@/components/tax/TaxTracker";
import { Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { currentYearKL, formatRM, formatRMShort, round2 } from "@/lib/format";

/** Kad Cukai di Home: 3 kategori dengan penggunaan tertinggi + jumlah boleh dituntut. */
export function TaxHomeCard() {
  const year = currentYearKL();
  const { data, loading } = useData(() => loadTaxSummary(year), [year]);
  const rows = (data?.summary.rows ?? [])
    .filter((r) => r.category.type === "relief" && r.used > 0)
    .sort((a, b) => (b.category.cap_amount ? b.used / b.category.cap_amount : 0) - (a.category.cap_amount ? a.used / a.category.cap_amount : 0) || b.used - a.used)
    .slice(0, 3);

  return (
    <Link href="/belanja?tab=cukai" className="block rounded-2xl bg-tax p-4 text-white active:opacity-90">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-white/70">Cukai · YA {year}</p>
        <ChevronRight className="size-4 text-white/70" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-40 bg-white/20" />
      ) : (
        <>
          <p className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{formatRM(data?.summary.reliefTotal ?? 0)}</p>
          <p className="text-sm text-white/70">boleh dituntut setakat ini</p>
        </>
      )}
      {rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((r) => {
            const cap = r.category.cap_amount;
            const ratio = cap ? Math.min(1, r.used / cap) : 0;
            return (
              <li key={r.category.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{r.category.name}</span>
                  <span className="shrink-0 text-xs font-semibold">
                    {formatRMShort(round2(r.used))}
                    {cap ? <span className="font-normal text-white/60"> / {formatRMShort(cap)}</span> : null}
                  </span>
                </div>
                {cap ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className={`h-full rounded-full ${r.used > cap ? "bg-red-400" : "bg-accent"}`} style={{ width: `${ratio * 100}%` }} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : !loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-white/80">
          <Landmark className="size-4" /> Snap resit yang layak untuk mula menjejak pelepasan.
        </p>
      ) : null}
    </Link>
  );
}
