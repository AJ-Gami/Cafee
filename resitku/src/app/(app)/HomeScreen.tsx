"use client";

import { ChevronRight, ScanLine } from "lucide-react";
import Link from "next/link";
import { TaxHomeCard } from "@/components/home/TaxHomeCard";
import { useSession } from "@/components/layout/SessionProvider";
import { useReceiptCapture } from "@/components/receipts/useReceiptCapture";
import { Card } from "@/components/ui/Card";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Fab } from "@/components/ui/Fab";
import { Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { currentMonthKL, formatDate, formatRM, greetingKL, monthLabel } from "@/lib/format";
import { fetchExpenseCategories, fetchExpensesForMonth, fetchPendingReceipts } from "@/lib/queries";

export function HomeScreen() {
  const { displayName } = useSession();
  const month = currentMonthKL();
  const capture = useReceiptCapture();
  const { data: expenses, loading } = useData(() => fetchExpensesForMonth(month), [month]);
  const { data: pending } = useData(fetchPendingReceipts, []);
  const { data: categories } = useData(fetchExpenseCategories, []);
  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const recent = (expenses ?? []).slice(0, 4);
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));

  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-muted">{greetingKL()}</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{displayName}</h1>
        </div>
        <Link href="/profil" aria-label="Profil" className="grid size-11 place-items-center rounded-2xl bg-accent text-lg font-extrabold">
          {displayName.slice(0, 1).toUpperCase()}
        </Link>
      </header>

      <div className="mt-5 flex flex-col gap-3">
        <Link href="/belanja">
          <Card className="p-4 active:bg-canvas">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-muted">Belanja {monthLabel(month)}</p>
              <ChevronRight className="size-4 text-muted" />
            </div>
            {loading ? <Skeleton className="mt-2 h-9 w-44" /> : <p className="mt-1 text-3xl font-extrabold tracking-tight">{formatRM(total)}</p>}
            <p className="mt-1 text-sm text-muted">{expenses ? `${expenses.length} transaksi` : " "}</p>
          </Card>
        </Link>

        <TaxHomeCard />

        {pending && pending.length > 0 ? (
          <Link href={`/belanja/resit/${pending[0]!.id}`}>
            <Card className="flex items-center gap-3 border-accent bg-accent-soft p-3 active:opacity-80">
              <ScanLine className="size-5" />
              <span className="flex-1 text-sm font-semibold">
                {pending.length === 1 ? "1 resit menunggu semakan" : `${pending.length} resit menunggu semakan`}
              </span>
              <ChevronRight className="size-4" />
            </Card>
          </Link>
        ) : null}

        {recent.length > 0 ? (
          <section className="mt-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="eyebrow text-muted">Terkini</h2>
              <Link href="/belanja" className="text-xs font-semibold text-muted">
                Lihat semua
              </Link>
            </div>
            <Card className="divide-y divide-line overflow-hidden">
              {recent.map((e) => {
                const cat = e.category_id ? catById.get(e.category_id) : undefined;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-canvas">
                      <CategoryIcon name={cat?.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.merchant || cat?.name || "Belanja"}</span>
                      <span className="block text-xs text-muted">{formatDate(e.expense_date)}</span>
                    </span>
                    <span className="font-bold">{formatRM(e.amount)}</span>
                  </div>
                );
              })}
            </Card>
          </section>
        ) : null}
      </div>

      {/* Butang + di Home terus membuka kamera untuk snap resit. */}
      <Fab label="Snap resit" onClick={capture.openCamera} />
      {capture.element}
    </main>
  );
}
