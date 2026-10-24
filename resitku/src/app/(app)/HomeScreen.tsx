"use client";

import { Camera, ChevronRight, ImageUp, PencilLine, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ExpenseSheet } from "@/components/expenses/ExpenseSheet";
import { useSession } from "@/components/layout/SessionProvider";
import { useReceiptCapture } from "@/components/receipts/useReceiptCapture";
import { ActionMenu } from "@/components/ui/ActionMenu";
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
  const [version, setVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const capture = useReceiptCapture();
  const { data: expenses, loading } = useData(() => fetchExpensesForMonth(month), [month, version]);
  const { data: pending } = useData(fetchPendingReceipts, [version]);
  const { data: categories, setData: setCategories } = useData(fetchExpenseCategories, []);
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

      <Fab label="Tambah belanja" onClick={() => setMenuOpen(true)} />
      {capture.element}
      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Tambah belanja"
        items={[
          { icon: Camera, label: "Snap resit", description: "Ambil gambar, AI baca butirannya", onSelect: capture.openCamera },
          { icon: ImageUp, label: "Pilih dari galeri / PDF", description: "Gambar resit atau invois PDF", onSelect: capture.openGallery },
          { icon: PencilLine, label: "Tambah manual", description: "Isi jumlah dan kategori sendiri", onSelect: () => setManualOpen(true) },
        ]}
      />
      {manualOpen ? (
        <ExpenseSheet
          open
          onClose={() => setManualOpen(false)}
          categories={categories ?? []}
          onCategoriesChange={(list) => setCategories(() => list)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </main>
  );
}
