"use client";

import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { AlertCircle, ChevronRight, Loader2, Paperclip, Receipt as ReceiptIcon, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Input } from "@/components/ui/Field";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { formatDate, formatRM } from "@/lib/format";
import { categoryMap, fetchExpensesForMonth, fetchPendingReceipts } from "@/lib/queries";
import type { Expense, ExpenseCategory } from "@/lib/types";

const DAY_NAMES = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];

function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${formatDate(date)}`;
}

export function ExpenseList({
  month,
  onMonthChange,
  categories,
  version,
  onOpen,
  onAdd,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  categories: ExpenseCategory[];
  version: number;
  onOpen: (e: Expense) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const { data: expenses, loading, error, reload } = useData(() => fetchExpensesForMonth(month), [month, version]);
  const { data: pending } = useData(fetchPendingReceipts, [version]);
  const cats = useMemo(() => categoryMap(categories), [categories]);

  const usedCategories = useMemo(() => {
    const ids = new Set((expenses ?? []).map((e) => e.category_id));
    return categories.filter((c) => ids.has(c.id));
  }, [expenses, categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (expenses ?? []).filter((e) => {
      if (filter && e.category_id !== filter) return false;
      if (!q) return true;
      const cat = e.category_id ? cats.get(e.category_id)?.name : "";
      return [e.merchant, e.note, cat].some((v) => v?.toLowerCase().includes(q));
    });
  }, [expenses, query, filter, cats]);

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of filtered) map.set(e.expense_date, [...(map.get(e.expense_date) ?? []), e]);
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <MonthPicker value={month} onChange={onMonthChange} />

      <Card className="p-4">
        <p className="eyebrow text-muted">Jumlah bulan ini</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-40" />
        ) : (
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{formatRM(total)}</p>
        )}
        <p className="mt-1 text-sm text-muted">
          {expenses ? `${expenses.length} transaksi` : " "}
          {filter || query ? ` · ditapis: ${formatRM(filteredTotal)}` : ""}
        </p>
      </Card>

      {pending && pending.length > 0 ? (
        <Card className="overflow-hidden">
          <p className="eyebrow px-4 pt-3 text-muted">Resit menunggu semakan ({pending.length})</p>
          <ul className="divide-y divide-line">
            {pending.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={`/belanja/resit/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-canvas">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft">
                    {r.status === "processing" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : r.status === "failed" ? (
                      <AlertCircle className="size-4 text-red-600" />
                    ) : (
                      <ScanLine className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.merchant || "Resit baharu"}</span>
                    <span className="block text-xs text-muted">
                      {r.status === "processing" ? "Sedang dibaca…" : r.status === "failed" ? "Gagal dibaca — isi manual" : "Sedia untuk disemak"}
                    </span>
                  </span>
                  {r.total_amount != null ? <span className="text-sm font-semibold">{formatRM(r.total_amount)}</span> : null}
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari kedai, nota atau kategori"
          className="pl-10"
          aria-label="Cari belanja"
        />
      </div>

      {usedCategories.length > 1 ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={filter === null} onClick={() => setFilter(null)}>
            Semua
          </Chip>
          {usedCategories.map((c) => (
            <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(filter === c.id ? null : c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {error ? (
        <Card className="flex items-center justify-between gap-3 p-4 text-sm">
          <span className="text-red-700">{error}</span>
          <Button variant="secondary" className="h-9 px-3 text-sm" onClick={reload}>
            Cuba lagi
          </Button>
        </Card>
      ) : loading ? (
        <SkeletonList rows={5} />
      ) : groups.length === 0 ? (
        expenses && expenses.length > 0 ? (
          <EmptyState icon={Search} title="Tiada padanan" text="Cuba carian atau tapisan lain." />
        ) : (
          <EmptyState
            icon={ReceiptIcon}
            title="Tiada belanja bulan ini"
            text="Snap resit atau tambah belanja secara manual."
            action={<Button onClick={onAdd}>Tambah belanja</Button>}
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, items]) => (
            <section key={date}>
              <div className="mb-1.5 flex justify-between px-1 text-xs font-semibold text-muted">
                <span>{dayLabel(date)}</span>
                <span>{formatRM(items.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {items.map((e) => {
                  const cat = e.category_id ? cats.get(e.category_id) : undefined;
                  return (
                    <button key={e.id} type="button" onClick={() => onOpen(e)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas">
                        <CategoryIcon name={cat?.icon} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.merchant || cat?.name || "Belanja"}</span>
                        <span className="block truncate text-xs text-muted">
                          {cat?.name ?? "Tiada kategori"}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      </span>
                      {e.receipt_id ? <Paperclip className="size-4 shrink-0 text-muted" aria-label="Ada resit" /> : null}
                      <span className="shrink-0 font-bold">{formatRM(e.amount)}</span>
                    </button>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
    >
      {children}
    </button>
  );
}
