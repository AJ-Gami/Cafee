import { FastForward, Store } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playSound } from '../../app/sound';
import { Button } from '../../components/Button';
import { CafeScene } from '../../components/CafeScene';
import { Card } from '../../components/Card';
import { Money } from '../../components/Money';
import { ProgressBar } from '../../components/ProgressBar';
import { CLOSE_HOUR, OPEN_HOUR } from '../../game/constants';
import { BRANCH_LOCATIONS } from '../../game/data/branches';
import { formatHour } from '../../game/demand';
import { GOAL_TITLE } from '../../game/goals';
import { cumulativeByHour } from '../../game/reports';
import type { DayReport, TimelineTone } from '../../game/types';

const STEP_MS = 650;

const TONE: Record<TimelineTone, string> = {
  neutral: 'border-espresso-500/30 bg-cream-50',
  good: 'border-sage-600/30 bg-sage-50',
  warn: 'border-honey-700/30 bg-honey-100',
  bad: 'border-rust-600/30 bg-rust-100',
};

/**
 * Presentational replay of an already-settled day. The engine has finished all
 * calculations before this renders; refreshing mid-replay simply shows the report.
 */
export function DayPlayback({ report, onDone }: { report: DayReport; onDone: () => void }) {
  const cumulative = useMemo(() => cumulativeByHour(report), [report]);
  const reduceMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const totalSteps = cumulative.length; // one step per opening hour
  const [step, setStep] = useState(reduceMotion ? totalSteps : 0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (step >= totalSteps) {
      const t = window.setTimeout(() => doneRef.current(), reduceMotion ? 0 : 900);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [step, totalSteps, reduceMotion]);

  // Sounds follow the replay: the door bell at opening, a tick for each hour with sales, a
  // fanfare when the day's goal is reached and the till when the café closes.
  const goalSounded = useRef(false);
  useEffect(() => {
    if (step === 0) {
      playSound('bell');
      return;
    }
    const now = cumulative[Math.min(step, totalSteps) - 1];
    const before = step > 1 ? cumulative[step - 2] : undefined;
    const target = report.goal?.targetSen;
    const total = (s: typeof now) => (s ? s.revenueSen + s.branchRevenueSen : 0);
    if (target !== undefined && !goalSounded.current && total(now) >= target) {
      goalSounded.current = true;
      playSound('fanfare');
    } else if (step >= totalSteps) {
      playSound('register');
    } else if (total(now) > total(before)) {
      playSound('tick');
    }
  }, [step, cumulative, totalSteps, report.goal]);

  const currentHour = step === 0 ? OPEN_HOUR : step >= totalSteps ? CLOSE_HOUR : OPEN_HOUR + step;
  const empty = { served: 0, revenueSen: 0, lost: 0, branchRevenueSen: 0 };
  const snapshot = step === 0 ? empty : (cumulative[Math.min(step, totalSteps) - 1] ?? empty);
  // Goals count the whole business's revenue.
  const totalRevenueSen = snapshot.revenueSen + snapshot.branchRevenueSen;
  const visibleEvents = report.timeline.filter((t) => t.hour <= currentHour).slice(-5);
  const goal = report.goal;
  const closed = step >= totalSteps;
  const goalReached = goal !== null && (closed ? goal.achieved : totalRevenueSen >= goal.targetSen);

  const servedThisHour = step === 0 || closed ? 0 : snapshot.served - (step > 1 ? (cumulative[step - 2]?.served ?? 0) : 0);

  return (
    <Card className="overflow-hidden">
      <CafeScene
        evening={closed}
        customers={Math.ceil(servedThisHour / 3)}
        seed={step}
        shaded={false}
        className="-mx-4 -mt-4 mb-4 block h-44 w-[calc(100%+2rem)] max-w-none"
      />
      <p className="sr-only" role="status">
        {closed
          ? `Kafe ditutup. ${snapshot.served} pelanggan dilayan.${goal ? (goal.achieved ? ' Sasaran jualan dicapai.' : ' Sasaran jualan tidak dicapai.') : ''}`
          : step === 0
            ? `Hari ${report.day}: kafe dibuka.`
            : ''}
      </p>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-sage-700 text-white">
          <Store className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight text-espresso-800">{step >= totalSteps ? 'Kafe ditutup' : 'Kafe sedang dibuka'}</p>
          <p className="text-sm text-espresso-600">Hari {report.day} · simulasi pelanggan</p>
        </div>
        <p className="tabular font-display text-3xl text-espresso-800" aria-label={`Jam ${formatHour(currentHour)}`}>
          {formatHour(currentHour)}
        </p>
      </div>
      <ProgressBar value={step} max={totalSteps} label="Kemajuan hari" className="mt-4" />
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-cream-100 p-2.5">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Dilayan</dt>
          <dd className="tabular mt-0.5 text-xl font-semibold">{snapshot.served}</dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2.5">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Jualan</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <Money sen={snapshot.revenueSen} />
          </dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2.5">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Beredar</dt>
          <dd className="tabular mt-0.5 text-xl font-semibold">{snapshot.lost}</dd>
        </div>
      </dl>
      {report.branches.length > 0 ? (
        <p className="mt-2 text-sm text-espresso-700">
          {report.branches.length === 1
            ? `Cawangan ${BRANCH_LOCATIONS[report.branches[0]!.location].shortName}`
            : `${report.branches.length} cawangan`}
          : jualan <Money sen={snapshot.branchRevenueSen} />
        </p>
      ) : null}
      {goal ? (
        <div className="mt-3 rounded-xl bg-cream-100 p-2.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-semibold text-espresso-800">{GOAL_TITLE[goal.kind]}</span>
            <span className="text-espresso-700">
              <Money sen={totalRevenueSen} /> / <Money sen={goal.targetSen} />
            </span>
          </p>
          <ProgressBar value={totalRevenueSen} max={goal.targetSen} tone={goalReached ? 'sage' : 'caramel'} label={GOAL_TITLE[goal.kind]} className="mt-1.5" />
          {goalReached ? (
            <p className="mt-1 text-sm font-semibold text-sage-700">Sasaran dicapai!</p>
          ) : closed ? (
            <p className="mt-1 text-sm font-semibold text-rust-700">Sasaran tidak dicapai</p>
          ) : null}
        </div>
      ) : null}
      <ol className="mt-4 min-h-40 space-y-2">
        {visibleEvents.map((t, i) => (
          <li key={`${t.hour}-${i}-${t.text}`} className={`animate-fade-up rounded-xl border px-3 py-2 text-sm ${TONE[t.tone]}`}>
            <span className="tabular mr-2 font-semibold text-espresso-600">{formatHour(t.hour)}</span>
            {t.text}
          </li>
        ))}
      </ol>
      <Button variant="secondary" block className="mt-4" onClick={onDone} icon={<FastForward className="size-4" aria-hidden="true" />}>
        Langkau ke laporan
      </Button>
    </Card>
  );
}
