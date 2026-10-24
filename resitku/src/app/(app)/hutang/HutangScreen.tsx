"use client";

import { CheckCircle2, Flame, HandCoins, History, MessageCircle, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { DebtDetailSheet } from "@/components/debts/DebtDetailSheet";
import { DebtSheet } from "@/components/debts/DebtSheet";
import { PaymentSheet } from "@/components/debts/PaymentSheet";
import { useSession } from "@/components/layout/SessionProvider";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented, UnderlineTabs } from "@/components/ui/Segmented";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { DIRECTION_LABELS, fetchDebtPayments, fetchDebts, paymentStreak, whatsappReminderUrl, type Debt, type DebtDirection } from "@/lib/debts";
import { formatDate, formatRM } from "@/lib/format";

type SubTab = "aktif" | "selesai" | "sejarah";

export function HutangScreen() {
  const { displayName } = useSession();
  const [direction, setDirection] = useState<DebtDirection>("i_owe");
  const [sub, setSub] = useState<SubTab>("aktif");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<{ debt: Debt | null } | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: debts, loading } = useData(() => fetchDebts(direction), [direction, version]);
  const { data: payments } = useData(() => fetchDebtPayments(direction), [direction, version]);
  const bump = () => setVersion((v) => v + 1);
  const labels = DIRECTION_LABELS[direction];

  const active = useMemo(() => (debts ?? []).filter((d) => d.status === "active").sort((a, b) => a.current_balance - b.current_balance), [debts]);
  const done = useMemo(() => (debts ?? []).filter((d) => d.status === "paid_off"), [debts]);
  const totalBalance = active.reduce((s, d) => s + d.current_balance, 0);
  const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0);
  const streak = paymentStreak(payments ?? []);
  const paying = (debts ?? []).find((d) => d.id === payingId) ?? null;
  const detail = (debts ?? []).find((d) => d.id === detailId) ?? null;

  return (
    <main>
      <PageHeader title="Hutang" />
      <div className="flex flex-col gap-3 px-4">
        <Segmented
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setSub("aktif");
          }}
          options={[
            { value: "i_owe", label: "Hutang Saya" },
            { value: "owed_to_me", label: "Orang Hutang Saya" },
          ]}
        />

        {loading ? (
          <SkeletonCard className="h-40" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Stat dark label={direction === "i_owe" ? "Baki keseluruhan" : "Perlu diterima"} value={formatRM(totalBalance)} wide />
            <Stat label="Hutang aktif" value={String(active.length)} />
            <Stat label={labels.paid} value={formatRM(totalPaid)} />
            <Stat
              label="Streak"
              value={streak > 0 ? `${streak} bulan` : "–"}
              icon={<Flame className={`size-4 ${streak > 0 ? "text-orange-500" : "text-muted"}`} />}
              hint={streak > 0 ? "Bulan berturut-turut ada bayaran" : "Catat bayaran untuk mula streak"}
              wide
            />
          </div>
        )}

        <UnderlineTabs
          value={sub}
          onChange={setSub}
          options={[
            { value: "aktif", label: "Aktif", badge: active.length || undefined },
            { value: "selesai", label: "Selesai" },
            { value: "sejarah", label: "Sejarah" },
          ]}
        />

        {loading ? (
          <SkeletonList rows={3} />
        ) : sub === "aktif" ? (
          active.length === 0 ? (
            <EmptyState
              icon={direction === "i_owe" ? CheckCircle2 : HandCoins}
              title={direction === "i_owe" ? "Tiada hutang aktif" : "Tiada orang berhutang"}
              text={direction === "i_owe" ? "Tambah hutang untuk mula menjejak baki dan bayaran." : "Rekod pinjaman kepada kawan atau keluarga."}
              action={<Button onClick={() => setForm({ debt: null })}>{labels.add}</Button>}
            />
          ) : (
            <>
              {direction === "i_owe" && active.length > 1 ? (
                <p className="px-1 text-xs text-muted">Susunan bayar: baki paling kecil dulu (kaedah snowball) untuk kemenangan cepat.</p>
              ) : null}
              {active.map((d, i) => (
                <DebtCard
                  key={d.id}
                  debt={d}
                  rank={direction === "i_owe" ? i + 1 : null}
                  onOpen={() => setDetailId(d.id)}
                  onPay={() => setPayingId(d.id)}
                  whatsappUrl={direction === "owed_to_me" ? whatsappReminderUrl(d, displayName) : null}
                />
              ))}
            </>
          )
        ) : sub === "selesai" ? (
          done.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Belum ada yang selesai" text="Hutang yang bakinya sifar akan muncul di sini." />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {done.map((d) => (
                <button key={d.id} type="button" onClick={() => setDetailId(d.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.name}</span>
                    <span className="block text-xs text-muted">Selesai · {formatDate(d.updated_at)}</span>
                  </span>
                  <span className="font-bold">{formatRM(d.original_amount)}</span>
                </button>
              ))}
            </Card>
          )
        ) : !payments || payments.length === 0 ? (
          <EmptyState icon={History} title="Tiada sejarah bayaran" text="Setiap bayaran yang dicatat akan disenaraikan di sini." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {payments.map((p) => (
              <button key={p.id} type="button" onClick={() => setDetailId(p.debt_id)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas">
                <span className="grid size-9 place-items-center rounded-xl bg-canvas">
                  <Wallet className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.debt?.name ?? "Hutang"}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatDate(p.paid_date)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                <span className="font-bold">{formatRM(p.amount)}</span>
              </button>
            ))}
          </Card>
        )}
      </div>

      <Fab label={labels.add} onClick={() => setForm({ debt: null })} />
      {form ? <DebtSheet direction={direction} debt={form.debt} onClose={() => setForm(null)} onSaved={bump} /> : null}
      {paying ? <PaymentSheet debt={paying} onClose={() => setPayingId(null)} onSaved={bump} /> : null}
      {detail && !paying && !form ? (
        <DebtDetailSheet
          debt={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ debt: detail })}
          onPay={() => setPayingId(detail.id)}
          onChanged={bump}
        />
      ) : null}
    </main>
  );
}

function Stat({ label, value, dark, wide, icon, hint }: { label: string; value: string; dark?: boolean; wide?: boolean; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className={`rounded-2xl p-3.5 ${dark ? "bg-debt text-white" : "border border-line bg-white"} ${wide ? "col-span-2" : ""}`}>
      <p className={`eyebrow ${dark ? "text-white/60" : "text-muted"}`}>{label}</p>
      <p className={`mt-0.5 flex items-center gap-1.5 font-extrabold ${dark ? "text-2xl" : "text-lg"}`}>
        {icon}
        {value}
      </p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function DebtCard({
  debt,
  rank,
  onOpen,
  onPay,
  whatsappUrl,
}: {
  debt: Debt;
  rank: number | null;
  onOpen: () => void;
  onPay: () => void;
  whatsappUrl: string | null;
}) {
  const paid = Math.max(0, debt.original_amount - debt.current_balance);
  const pct = debt.original_amount > 0 ? Math.min(100, (paid / debt.original_amount) * 100) : 0;
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full p-4 text-left active:bg-canvas">
        <div className="flex items-start gap-3">
          {rank ? (
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${rank === 1 ? "bg-accent" : "bg-canvas"}`}>{rank}</span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{debt.name}</p>
            <p className="text-xs text-muted">
              {debt.min_payment != null ? `Minimum ${formatRM(debt.min_payment)} sebulan` : `Asal ${formatRM(debt.original_amount)}`}
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow text-muted">Baki</p>
            <p className="font-extrabold">{formatRM(debt.current_balance)}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{Math.round(pct)}% selesai</p>
      </button>
      <div className="flex border-t border-line">
        <button type="button" onClick={onPay} className="flex h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold active:bg-canvas">
          <Wallet className="size-4" /> {DIRECTION_LABELS[debt.direction].record}
        </button>
        {debt.direction === "owed_to_me" ? (
          whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 flex-1 items-center justify-center gap-2 border-l border-line text-sm font-semibold text-[#128C7E] active:bg-canvas"
            >
              <MessageCircle className="size-4" /> Ingatkan melalui WhatsApp
            </a>
          ) : (
            <span className="flex h-11 flex-1 items-center justify-center border-l border-line text-xs text-muted">Tiada nombor WhatsApp</span>
          )
        ) : null}
      </div>
    </Card>
  );
}
