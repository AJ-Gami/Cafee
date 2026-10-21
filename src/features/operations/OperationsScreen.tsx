import { ArrowRight, CalendarDays, CircleAlert, CircleCheck, Coffee, Package, Sunrise, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Card, CardTitle, ScreenTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { weekdayName } from '../../game/demand';
import { capacityView, dayEstimate, fixedCostsView, lastReport, prepChecklist, visibleTodayEvent } from '../../game/selectors';
import { DayReportView } from '../reports/DayReportView';
import { DayPlayback } from './DayPlayback';
import { PromotionPicker } from './PromotionPicker';

export function OperationsScreen() {
  const { game } = useGame();
  if (game.phase === 'prep' && game.status === 'active') return <PrepView />;
  return <ClosedView />;
}

function PrepView() {
  const { game, dispatch } = useGame();
  const { go } = useNav();
  const checklist = useMemo(() => prepChecklist(game), [game]);
  const estimate = useMemo(() => dayEstimate(game), [game]);
  const cap = capacityView(game);
  const fixed = fixedCostsView(game);
  const event = visibleTodayEvent(game);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const problems = checklist.filter((c) => c.status === 'bad');

  // Reset the local guard if a new day starts while this view stays mounted.
  useEffect(() => setOpening(false), [game.day]);

  const open = () => {
    if (opening) return;
    setOpening(true);
    setConfirmOpen(false);
    // The engine ignores any repeated request for the same day, so double taps are harmless.
    dispatch({ type: 'OPEN_CAFE', day: game.day });
  };

  const onOpenClick = () => {
    if (problems.length > 0) setConfirmOpen(true);
    else open();
  };

  const linkFor = (id: string) => {
    if (id === 'stock' || id === 'menu') return () => go('menu', id === 'menu' ? 'harga' : 'inventori');
    if (id === 'capacity') return () => go('urus', 'staf');
    return null;
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title={`Persediaan Hari ${game.day}`} subtitle={`${weekdayName(game.day)} · buka 08:00–20:00`} />

      {event ? (
        <Notice tone={event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'warn' : 'info'} title={`Ramalan: ${event.title}`}>
          {event.description}
          {event.mitigationNote ? <span className="mt-1 block font-semibold">{event.mitigationNote}</span> : null}
        </Notice>
      ) : (
        <Notice tone="info" title="Tiada ramalan khas">
          Hari biasa dijangka. Peristiwa mengejut masih boleh berlaku semasa kafe dibuka.
        </Notice>
      )}

      <Card>
        <CardTitle title="Senarai semak" subtitle="Pastikan kafe bersedia sebelum dibuka." icon={<Sunrise className="size-5" />} />
        <ul className="space-y-2">
          {checklist.map((item) => {
            const action = linkFor(item.id);
            const Icon = item.status === 'ok' ? CircleCheck : item.status === 'warn' ? TriangleAlert : CircleAlert;
            const color = item.status === 'ok' ? 'text-sage-700' : item.status === 'warn' ? 'text-honey-700' : 'text-rust-700';
            const body = (
              <>
                <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} aria-label={item.status === 'ok' ? 'Sedia' : item.status === 'warn' ? 'Amaran' : 'Masalah'} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-espresso-800">{item.label}</span>
                  <span className="block text-sm text-espresso-600">{item.detail}</span>
                </span>
                {action ? <ArrowRight className="mt-0.5 size-4 shrink-0 text-espresso-500" aria-hidden="true" /> : null}
              </>
            );
            return (
              <li key={item.id}>
                {action ? (
                  <button type="button" onClick={action} className="flex min-h-11 w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-cream-100">
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 p-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle title="Ramalan hari ini" subtitle="Anggaran berdasarkan reputasi, hari, harga dan promosi." icon={<CalendarDays className="size-5" />} />
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-xs font-semibold uppercase text-espresso-600">Anggaran pelanggan</dt>
            <dd className="mt-0.5 text-xl font-semibold">~{estimate.footfall}</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-xs font-semibold uppercase text-espresso-600">Kapasiti</dt>
            <dd className="mt-0.5 text-xl font-semibold">
              {cap.perDay} <span className="text-sm font-normal text-espresso-600">({cap.perHour}/jam)</span>
            </dd>
          </div>
          <div className="col-span-2 rounded-xl bg-cream-100 p-3">
            <dt className="text-xs font-semibold uppercase text-espresso-600">Kos tetap dibayar semasa tutup</dt>
            <dd className="mt-0.5 text-sm text-espresso-700">
              Gaji <Money sen={fixed.wagesSen} /> · Sewa <Money sen={fixed.rentSen} /> · Utiliti asas <Money sen={fixed.utilitiesBaseSen} />
            </dd>
            <dd className="mt-1 text-lg font-semibold">
              <Money sen={fixed.totalSen} />
            </dd>
          </div>
        </dl>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon={<Package className="size-4" aria-hidden="true" />} onClick={() => go('menu', 'inventori')}>
            Stok
          </Button>
          <Button variant="secondary" size="sm" icon={<Users className="size-4" aria-hidden="true" />} onClick={() => go('urus', 'staf')}>
            Staf
          </Button>
        </div>
      </Card>

      <PromotionPicker />

      <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom,0px))] z-10 -mx-1 rounded-3xl bg-cream-100/90 p-1 backdrop-blur">
        <Button size="lg" variant="accent" block onClick={onOpenClick} loading={opening} icon={<Coffee className="size-5" aria-hidden="true" />}>
          {opening ? 'Membuka kafe…' : `Buka kafe — Hari ${game.day}`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Buka kafe walaupun belum bersedia?"
        confirmLabel="Buka juga"
        onConfirm={open}
        onCancel={() => setConfirmOpen(false)}
      >
        <ul className="list-disc space-y-1 pl-5">
          {problems.map((p) => (
            <li key={p.id}>
              <span className="font-semibold">{p.label}:</span> {p.detail}
            </li>
          ))}
        </ul>
        <p className="mt-2">Pelanggan yang tidak dapat dilayan akan menjejaskan reputasi. Hari ini hanya boleh diproses sekali.</p>
      </ConfirmDialog>
    </div>
  );
}

function ClosedView() {
  const { game, store, dispatch } = useGame();
  const report = lastReport(game);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const showPlayback = report !== null && store.justSettledDay === report.day && !playbackDone;

  useEffect(() => {
    setPlaybackDone(false);
    setAdvancing(false);
  }, [report?.day]);

  if (!report) {
    return (
      <Notice tone="warn" title="Laporan tidak dijumpai">
        Laporan hari ini tidak tersedia. Mulakan hari seterusnya untuk meneruskan permainan.
      </Notice>
    );
  }

  if (showPlayback) {
    return (
      <div className="space-y-4">
        <ScreenTitle title={`Hari ${report.day} sedang berjalan`} subtitle="Pelanggan sedang datang…" />
        <DayPlayback
          report={report}
          onDone={() => {
            setPlaybackDone(true);
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    );
  }

  const nextDay = () => {
    if (advancing) return;
    setAdvancing(true);
    dispatch({ type: 'START_NEXT_DAY', day: game.day });
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title={`Laporan Hari ${report.day}`} subtitle="Semak prestasi sebelum memulakan hari baharu." />
      <DayReportView report={report} />
      {game.status === 'active' ? (
        <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom,0px))] z-10 -mx-1 rounded-3xl bg-cream-100/90 p-1 backdrop-blur">
          <Button size="lg" block onClick={nextDay} loading={advancing} icon={<Sunrise className="size-5" aria-hidden="true" />}>
            Mulakan Hari {game.day + 1}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
