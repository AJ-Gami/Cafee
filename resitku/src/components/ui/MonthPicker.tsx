"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, currentMonthKL, monthLabel } from "@/lib/format";

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const isCurrent = value >= currentMonthKL();
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-1">
      <button
        type="button"
        aria-label="Bulan sebelumnya"
        onClick={() => onChange(addMonths(value, -1))}
        className="grid size-10 place-items-center rounded-xl active:bg-canvas"
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="font-semibold">{monthLabel(value)}</span>
      <button
        type="button"
        aria-label="Bulan seterusnya"
        disabled={isCurrent}
        onClick={() => onChange(addMonths(value, 1))}
        className="grid size-10 place-items-center rounded-xl active:bg-canvas disabled:opacity-30"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
