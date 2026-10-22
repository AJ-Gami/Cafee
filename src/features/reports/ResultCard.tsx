import { Gauge, Heart, ShoppingCart, Target, Users } from 'lucide-react';
import { CafeScene } from '../../components/CafeScene';
import { Money } from '../../components/Money';
import { EVENTS } from '../../game/data/events';
import { percentPoints, reputationPoints, weekdayName } from '../../game/demand';
import { GOAL_TITLE, goalShortfallSen } from '../../game/goals';
import { formatRM } from '../../game/money';
import { servedTotal, shareText } from '../../game/reports';
import type { DayReport } from '../../game/types';
import { renderShareImage } from './shareImage';
import { ShareActions } from './ShareActions';

/** Shareable end-of-day result card. */
export function ResultCard({ report }: { report: DayReport }) {
  const repDelta = Math.round((report.reputationAfter - report.reputationBefore) * 10) / 10;
  const goal = report.goal;

  return (
    <section aria-label={`Kad keputusan Hari ${report.day}`} className="overflow-hidden rounded-3xl bg-cream-50 shadow-lift">
      <div className="relative h-36 overflow-hidden bg-espresso-800">
        <CafeScene evening className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso-900/95 via-espresso-900/60 to-transparent" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-end p-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream-200">Laporan akhir hari</p>
          <p className="font-display text-2xl leading-tight">{report.cafeName}</p>
          <p className="text-sm text-cream-100">
            Hari {report.day} · {weekdayName(report.day)}
          </p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Untung bersih</p>
        <p className="mt-0.5 text-4xl font-bold">
          <Money sen={report.netProfitSen} signed colored tabular={false} />
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <ShoppingCart className="size-3" aria-hidden="true" /> Hasil jualan
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money sen={report.revenueSen} tabular={false} />
            </dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Users className="size-3" aria-hidden="true" /> Dilayan
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">{servedTotal(report)} pelanggan</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Gauge className="size-3" aria-hidden="true" /> Kadar servis
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">{percentPoints(report.customers.serviceRate)}%</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Heart className="size-3" aria-hidden="true" /> Reputasi
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">
              {reputationPoints(report.reputationAfter)}{' '}
              <span className={`text-sm ${repDelta >= 0 ? 'text-sage-700' : 'text-rust-700'}`}>
                ({repDelta >= 0 ? '+' : '−'}
                {Math.abs(repDelta)})
              </span>
            </dd>
          </div>
        </dl>
        {goal ? (
          <p className={`mt-3 flex items-start gap-1.5 text-sm font-semibold ${goal.achieved ? 'text-sage-700' : 'text-rust-700'}`}>
            <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {GOAL_TITLE[goal.kind]} <Money sen={goal.targetSen} />:{' '}
              {goal.achieved ? (
                'dicapai!'
              ) : (
                <>
                  tidak dicapai (kurang <Money sen={goalShortfallSen(goal, report.revenueSen)} />)
                </>
              )}
            </span>
          </p>
        ) : null}
        {report.eventId ? <p className="mt-3 text-sm text-espresso-700">Peristiwa: {EVENTS[report.eventId].title}</p> : null}
        <ShareActions
          render={() => renderShareImage(report)}
          fileName={`cafe-empire-hari-${report.day}.png`}
          title={`${report.cafeName} — Hari ${report.day}`}
          text={() => shareText(report, formatRM)}
          cardName="Kad keputusan"
        />
        <p className="text-xs text-espresso-600">Data simulasi permainan — bukan data perniagaan sebenar.</p>
      </div>
    </section>
  );
}
