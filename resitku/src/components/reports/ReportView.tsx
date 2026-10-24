"use client";

import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { BarChart3, Trophy } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { CHART_COLORS, CHART_OTHER } from "@/lib/categoryIcons";
import { addMonths, formatRM, monthLabel, monthLabelShort, monthRange } from "@/lib/format";
import { fetchExpensesBetween } from "@/lib/queries";
import type { ExpenseCategory } from "@/lib/types";

type Slice = { id: string; name: string; icon: string; value: number; color: string };

export function ReportView({
  month,
  onMonthChange,
  categories,
  version,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  categories: ExpenseCategory[];
  version: number;
}) {
  const start = addMonths(month, -5);
  const { data: expenses, loading } = useData(() => fetchExpensesBetween(monthRange(start)[0], monthRange(month)[1]), [start, month, version]);

  const { slices, total, top } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses ?? []) {
      if (e.expense_date.slice(0, 7) !== month) continue;
      const key = e.category_id ?? "none";
      totals.set(key, (totals.get(key) ?? 0) + e.amount);
    }
    const total = [...totals.values()].reduce((s, v) => s + v, 0);
    // Warna mengikut susunan kategori (bukan kedudukan), supaya warna kekal untuk kategori yang sama.
    const ordered = categories.filter((c) => (totals.get(c.id) ?? 0) > 0);
    const byValue = [...ordered].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
    const shown = new Set(byValue.slice(0, CHART_COLORS.length - 1).map((c) => c.id));
    const slices: Slice[] = [];
    let colorIndex = 0;
    let other = totals.get("none") ?? 0;
    for (const c of ordered) {
      const value = totals.get(c.id) ?? 0;
      if (shown.has(c.id)) slices.push({ id: c.id, name: c.name, icon: c.icon, value, color: CHART_COLORS[colorIndex++]! });
      else other += value;
    }
    slices.sort((a, b) => b.value - a.value);
    if (other > 0) slices.push({ id: "other", name: "Lain-lain / tiada kategori", icon: "tag", value: other, color: CHART_OTHER });
    return { slices, total, top: byValue[0] ? { cat: byValue[0], value: totals.get(byValue[0].id) ?? 0 } : null };
  }, [expenses, categories, month]);

  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(start, i));
    const sums = new Map(months.map((m) => [m, 0]));
    for (const e of expenses ?? []) {
      const m = e.expense_date.slice(0, 7);
      if (sums.has(m)) sums.set(m, (sums.get(m) ?? 0) + e.amount);
    }
    return months.map((m) => ({ month: m, label: monthLabelShort(m), total: Math.round((sums.get(m) ?? 0) * 100) / 100 }));
  }, [expenses, start]);

  const average = trend.reduce((s, t) => s + t.total, 0) / trend.length;

  return (
    <div className="flex flex-col gap-3">
      <MonthPicker value={month} onChange={onMonthChange} />
      {loading ? (
        <>
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-56" />
        </>
      ) : (
        <>
          {total === 0 ? (
            <EmptyState icon={BarChart3} title="Tiada data bulan ini" text={`Belum ada belanja untuk ${monthLabel(month)}.`} />
          ) : (
            <>
              {top ? (
                <Card className="flex items-center gap-3 p-4">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent">
                    <Trophy className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow text-muted">Kategori tertinggi</p>
                    <p className="truncate font-bold">{top.cat.name}</p>
                    <p className="text-xs text-muted">
                      {formatRM(top.value)} · {Math.round((top.value / total) * 100)}% daripada jumlah
                    </p>
                  </div>
                </Card>
              ) : null}

              <Card className="p-4">
                <p className="eyebrow text-muted">Ikut kategori</p>
                <div className="relative mx-auto mt-2 h-52 w-full max-w-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="100%"
                        paddingAngle={1}
                        stroke="#ffffff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {slices.map((s) => (
                          <Cell key={s.id} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatRM(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #eceef2", fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-muted">Jumlah</span>
                    <span className="text-lg font-extrabold">{formatRM(total)}</span>
                  </div>
                </div>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {slices.map((s) => {
                    return (
                      <li key={s.id} className="flex items-center gap-2.5 text-sm">
                        <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                        <CategoryIcon name={s.icon} className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <span className="w-10 text-right text-muted">{Math.round((s.value / total) * 100)}%</span>
                        <span className="w-24 text-right font-semibold">{formatRM(s.value)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </>
          )}

          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow text-muted">Trend 6 bulan</p>
              <p className="text-xs text-muted">Purata {formatRM(average)}</p>
            </div>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "#f6f7f9" }}
                    formatter={(v) => [formatRM(Number(v)), "Jumlah"]}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload ? monthLabel(payload[0].payload.month as string) : "")}
                    contentStyle={{ borderRadius: 12, border: "1px solid #eceef2", fontSize: 13 }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {trend.map((t) => (
                      <Cell key={t.month} fill={t.month === month ? "#1e3a5f" : "#a9bad0"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
