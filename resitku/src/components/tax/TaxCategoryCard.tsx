"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatRM } from "@/lib/format";
import type { TaxUsage } from "@/lib/tax";

const TYPE_LABEL = { relief: null, deduction: "Potongan", rebate: "Rebat" } as const;

function UsageLine({ usage, year, small }: { usage: TaxUsage; year: number; small?: boolean }) {
  const { category, used, excess, receiptCount } = usage;
  const cap = category.cap_amount;
  const typeLabel = TYPE_LABEL[category.type];
  return (
    <Link
      href={`/belanja/cukai/${category.id}?tahun=${year}`}
      className={`block active:bg-canvas ${small ? "rounded-xl px-3 py-2.5" : "p-4"}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`${small ? "text-sm" : ""} font-semibold leading-snug`}>
            {category.name}
            {typeLabel ? <span className="ml-2 rounded-full bg-tax/10 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-tax">{typeLabel}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {receiptCount === 0 ? "Belum ada resit" : `${receiptCount} resit`}
            {cap !== null ? ` · Baki ${formatRM(Math.max(0, cap - used))}` : category.type === "relief" ? "" : " · Tiada had"}
          </p>
        </div>
        <div className="text-right">
          <p className={`${small ? "text-sm" : ""} font-bold`}>{formatRM(used)}</p>
          {cap !== null ? <p className="text-xs text-muted">/ {formatRM(cap)}</p> : null}
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" />
      </div>
      {cap !== null ? <ProgressBar value={used} max={cap} className="mt-2" /> : null}
      {excess > 0 ? <p className="mt-1.5 text-xs font-semibold text-red-600">Lebihan {formatRM(excess)} tidak boleh dituntut</p> : null}
    </Link>
  );
}

export function TaxCategoryCard({ usage, year }: { usage: TaxUsage; year: number }) {
  return (
    <Card className="overflow-hidden">
      <UsageLine usage={usage} year={year} />
      {usage.children.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-line bg-canvas/60 p-2">
          <p className="eyebrow px-3 pt-1 text-muted">Sub-had (termasuk dalam had di atas)</p>
          {usage.children.map((child) => (
            <UsageLine key={child.category.id} usage={child} year={year} small />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
