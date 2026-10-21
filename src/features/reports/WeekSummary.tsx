import { CalendarRange } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Card, CardTitle, Row } from '../../components/Card';
import { Money } from '../../components/Money';
import { percentPoints, weekdayName } from '../../game/demand';
import type { WeeklySummary } from '../../game/reports';

function signedCount(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function weekStatusLabel(w: WeeklySummary): string | null {
  if (w.complete) return null;
  return w.inProgress ? `Sedang berjalan (${w.daysPlayed}/7 hari)` : `Data separa (${w.daysPlayed}/7 hari)`;
}

/** Totals for one week of play. `closing` marks the card shown on the report that ends the week. */
export function WeekSummaryCard({ summary: w, closing = false }: { summary: WeeklySummary; closing?: boolean }) {
  const status = weekStatusLabel(w);
  return (
    <Card className={closing ? 'border-sage-600/30 bg-sage-50' : ''} aria-label={`Ringkasan Minggu ${w.week}`}>
      <CardTitle
        title={closing ? `Minggu ${w.week} selesai!` : `Minggu ${w.week}`}
        subtitle={`Hari ${w.firstDay}–${w.lastDay} · ${weekdayName(w.firstDay)}–${weekdayName(w.lastDay)}`}
        icon={<CalendarRange className="size-5" />}
        action={status ? <Badge tone="warn">{status}</Badge> : null}
      />
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-cream-100 p-3">
          <dt className="text-xs font-semibold uppercase text-espresso-600">Hasil jualan</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <Money sen={w.revenueSen} tabular={false} />
          </dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-3">
          <dt className="text-xs font-semibold uppercase text-espresso-600">Untung bersih</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <Money sen={w.netProfitSen} tabular={false} colored />
          </dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-3">
          <dt className="text-xs font-semibold uppercase text-espresso-600">Pelanggan dilayan</dt>
          <dd className="mt-0.5 text-lg font-semibold">{w.served}</dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-3">
          <dt className="text-xs font-semibold uppercase text-espresso-600">Hari untung</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {w.profitableDays}/{w.daysPlayed}
          </dd>
        </div>
      </dl>
      {w.vsPrevious ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Berbanding minggu lalu">
          {w.vsPrevious.revenueChangePct !== null ? (
            <li>
              <Badge tone={w.vsPrevious.revenueChangePct >= 0 ? 'good' : 'bad'}>Hasil {signedCount(w.vsPrevious.revenueChangePct)}%</Badge>
            </li>
          ) : null}
          <li>
            <Badge tone={w.vsPrevious.netProfitChangeSen >= 0 ? 'good' : 'bad'}>
              Untung <Money sen={w.vsPrevious.netProfitChangeSen} signed />
            </Badge>
          </li>
          <li>
            <Badge tone={w.vsPrevious.servedChange >= 0 ? 'good' : 'bad'}>Pelanggan {signedCount(w.vsPrevious.servedChange)}</Badge>
          </li>
          <li className="self-center text-xs text-espresso-600">berbanding minggu lalu</li>
        </ul>
      ) : null}
      <dl className="mt-3 divide-y divide-espresso-800/[0.07]">
        <Row label="Kos barang dijual" value={<Money sen={-w.cogsSen} />} />
        <Row label="Jumlah perbelanjaan" value={<Money sen={-w.totalExpensesSen} />} />
        {w.otherIncomeSen > 0 ? <Row label="Pendapatan lain" value={<Money sen={w.otherIncomeSen} />} /> : null}
        <Row label="Kadar servis" value={`${percentPoints(w.serviceRate)}%`} />
        <Row
          label={`Hari terbaik: Hari ${w.bestDay.day} (${weekdayName(w.bestDay.day)})`}
          value={<Money sen={w.bestDay.revenueSen} />}
        />
        <Row
          label="Tunai"
          value={
            <>
              <Money sen={w.openingCashSen} /> → <Money sen={w.closingCashSen} />
            </>
          }
        />
        <Row label="Reputasi" value={`${w.reputationStart} → ${w.reputationEnd}`} />
      </dl>
    </Card>
  );
}
