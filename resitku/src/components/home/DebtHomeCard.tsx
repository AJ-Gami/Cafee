"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { fetchDebts } from "@/lib/debts";
import { formatRM } from "@/lib/format";

/** Kad Hutang (hitam) di Home. */
export function DebtHomeCard() {
  const { data: debts, loading } = useData(() => fetchDebts(), []);
  const active = (debts ?? []).filter((d) => d.status === "active");
  const mine = active.filter((d) => d.direction === "i_owe");
  const owed = active.filter((d) => d.direction === "owed_to_me");
  const next = [...mine].sort((a, b) => a.current_balance - b.current_balance)[0];

  return (
    <Link href="/hutang" className="flex flex-col rounded-2xl bg-debt p-4 text-white active:opacity-90">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-white/60">Hutang</p>
        <ChevronRight className="size-4 text-white/60" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28 bg-white/20" />
      ) : (
        <>
          <p className="mt-1 whitespace-nowrap text-lg font-extrabold leading-tight">{formatRM(mine.reduce((s, d) => s + d.current_balance, 0))}</p>
          <p className="text-xs text-white/60">{mine.length} hutang aktif</p>
          {next ? <p className="mt-2 truncate text-xs text-white/80">Bayar dulu: {next.name}</p> : null}
          {owed.length > 0 ? (
            <p className="mt-1 truncate text-xs text-accent">Orang hutang: {formatRM(owed.reduce((s, d) => s + d.current_balance, 0))}</p>
          ) : null}
        </>
      )}
    </Link>
  );
}
