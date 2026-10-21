import { FastForward, Store } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Money } from '../../components/Money';
import { ProgressBar } from '../../components/ProgressBar';
import { CLOSE_HOUR, OPEN_HOUR } from '../../game/constants';
import { formatHour } from '../../game/demand';
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

  const currentHour = step === 0 ? OPEN_HOUR : step >= totalSteps ? CLOSE_HOUR : OPEN_HOUR + step;
  const snapshot = step === 0 ? { served: 0, revenueSen: 0, lost: 0 } : cumulative[Math.min(step, totalSteps) - 1] ?? { served: 0, revenueSen: 0, lost: 0 };
  const visibleEvents = report.timeline.filter((t) => t.hour <= currentHour).slice(-5);

  return (
    <Card className="overflow-hidden">
      <p className="sr-only" role="status">
        {step >= totalSteps ? `Kafe ditutup. ${snapshot.served} pelanggan dilayan.` : step === 0 ? `Hari ${report.day}: kafe dibuka.` : ''}
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
