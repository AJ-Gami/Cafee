import { ArrowRight, CalendarDays, ChartColumn, Coffee, Gauge, Heart, Package, ShoppingCart, Target, Users, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CafeScene } from '../../components/CafeScene';
import { Card, CardTitle } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { ProgressBar } from '../../components/ProgressBar';
import { Stat } from '../../components/Stat';
import { reputationPoints, weekdayName } from '../../game/demand';
import { remainingPrincipal } from '../../game/loans';
import { formatRM } from '../../game/money';
import { levelInfo } from '../../game/objectives';
import { historySeries, servedTotal } from '../../game/reports';
import { capacityView, currentInventoryValue, dayEstimate, ingredientViews, lastReport, objectiveViews, visibleTodayEvent } from '../../game/selectors';
import { ProfitMiniChart } from '../finance/LazyCharts';
import { GoalCard } from '../operations/GoalCard';
import { TutorialCard } from '../tutorial/TutorialCard';

export function DashboardScreen() {
  const { game } = useGame();
  const { go } = useNav();
  const report = lastReport(game);
  const views = useMemo(() => ingredientViews(game), [game]);
  const estimate = useMemo(() => dayEstimate(game), [game]);
  const cap = capacityView(game);
  const event = visibleTodayEvent(game);
  const level = levelInfo(game);
  const nextObjectives = objectiveViews(game)
    .filter((o) => !o.complete)
    .slice(0, 2);
  const outOfStock = views.filter((v) => v.stockLevel === 'out');
  const lowStock = views.filter((v) => v.stockLevel === 'low');
  const isNewPlayer = game.day === 1 && game.phase === 'prep' && game.history.length === 0;
  const inUse = views.filter((v) => v.stockLevel !== 'off');
  const enough = inUse.filter((v) => v.stockLevel === 'ok');

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-espresso-800 text-cream-50 shadow-lift" aria-labelledby="hero-title">
        <CafeScene evening={game.phase === 'closed'} className="block h-36 w-full" />
        <div className="flex flex-col gap-3 px-5 pb-5 pt-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream-200">Real Life Tycoon · Café Empire</p>
            <h1 id="hero-title" className="mt-1 font-display text-3xl leading-tight text-white">
              {game.cafeName}
            </h1>
            <p className="mt-1 text-sm text-cream-100">
              Hari {game.day} · {weekdayName(game.day)} ·{' '}
              {game.status === 'bankrupt'
                ? 'Kafe muflis'
                : game.phase === 'prep'
                  ? 'Sedang membuat persediaan'
                  : 'Kafe ditutup — laporan sedia'}
            </p>
          </div>
          {game.status === 'active' ? (
            <Button
              variant={game.phase === 'prep' ? 'accent' : 'secondary'}
              size="lg"
              block
              onClick={() => go('operasi')}
              icon={game.phase === 'prep' ? <Coffee className="size-5" aria-hidden="true" /> : <ChartColumn className="size-5" aria-hidden="true" />}
            >
              {game.phase === 'prep' ? 'Ke persediaan & buka kafe' : `Lihat laporan Hari ${game.day}`}
            </Button>
          ) : null}
        </div>
      </section>

      <TutorialCard />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          className="col-span-2"
          emphasis
          label="Baki tunai"
          icon={<Wallet className="size-3.5" aria-hidden="true" />}
          value={<Money sen={game.cashSen} tabular={false} className={game.cashSen < 0 ? 'text-rust-700' : ''} />}
          hint={
            game.loan
              ? `Inventori ${formatRM(currentInventoryValue(game))} · Hutang ${formatRM(remainingPrincipal(game.loan))}`
              : `Nilai inventori ${formatRM(currentInventoryValue(game))}`
          }
        />
        <Stat
          label={report ? `Jualan H${report.day}` : 'Jualan harian'}
          icon={<ShoppingCart className="size-3.5" aria-hidden="true" />}
          value={report ? <Money sen={report.revenueSen} tabular={false} /> : '—'}
          hint={report ? `${servedTotal(report)} pelanggan dilayan` : 'Belum dibuka'}
        />
        <Stat
          label={report ? `Untung H${report.day}` : 'Untung bersih'}
          icon={<ChartColumn className="size-3.5" aria-hidden="true" />}
          value={report ? <Money sen={report.netProfitSen} tabular={false} colored /> : '—'}
          hint={report ? (report.netProfitSen >= 0 ? 'Untung' : 'Rugi') : 'Tiada data lagi'}
        />
        <Stat
          label="Reputasi"
          icon={<Heart className="size-3.5" aria-hidden="true" />}
          value={
            <span>
              {reputationPoints(game.reputation)}
              <span className="text-sm font-normal text-espresso-600">/100</span>
            </span>
          }
          hint={<ProgressBar value={reputationPoints(game.reputation)} max={100} label="Reputasi" className="mt-1.5" />}
        />
        <Stat
          label="Tahap kafe"
          icon={<Target className="size-3.5" aria-hidden="true" />}
          value={`Tahap ${level.current.level}`}
          hint={level.current.title}
        />
      </div>

      {/* Today */}
      {game.status === 'active' && game.phase === 'prep' ? (
        <Card>
          <CardTitle title={`Hari ini · ${weekdayName(game.day)}`} icon={<CalendarDays className="size-5" />} />
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cream-100 p-2.5">
              <dt className="text-[11px] font-semibold uppercase text-espresso-600">Anggaran pelanggan</dt>
              <dd className="mt-0.5 text-lg font-semibold">~{estimate.footfall}</dd>
            </div>
            <div className="rounded-xl bg-cream-100 p-2.5">
              <dt className="text-[11px] font-semibold uppercase text-espresso-600">Kapasiti sehari</dt>
              <dd className="mt-0.5 text-lg font-semibold">{cap.perDay}</dd>
            </div>
            <div className="rounded-xl bg-cream-100 p-2.5">
              <dt className="text-[11px] font-semibold uppercase text-espresso-600">Bahan cukup</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {enough.length}/{inUse.length}
              </dd>
            </div>
          </dl>
          {event ? (
            <div className="mt-3">
              <Notice tone={event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'warn' : 'info'} title={`Ramalan: ${event.title}`}>
                {event.description}
                {event.mitigationNote ? <span className="mt-1 block font-semibold">{event.mitigationNote}</span> : null}
              </Notice>
            </div>
          ) : (
            <p className="mt-3 text-sm text-espresso-600">Tiada ramalan khas hari ini — tetapi peristiwa mengejut boleh berlaku bila-bila masa.</p>
          )}
        </Card>
      ) : null}

      <GoalCard />

      {/* Alerts */}
      {game.phase === 'prep' && (outOfStock.length > 0 || lowStock.length > 0) && !isNewPlayer ? (
        <Notice
          tone={outOfStock.length > 0 ? 'bad' : 'warn'}
          title={outOfStock.length > 0 ? 'Ada bahan kehabisan stok' : 'Stok bahan rendah'}
          action={
            <Button size="sm" variant="secondary" icon={<Package className="size-4" aria-hidden="true" />} onClick={() => go('menu', 'inventori')}>
              Ke inventori
            </Button>
          }
        >
          {[
            ...outOfStock.map((v) => `${v.name} (habis)`),
            ...lowStock.map((v) => `${v.name} (${v.stock} ${v.unitLabel}, perlu ~${v.estimatedNeed})`),
          ].join(', ')}
        </Notice>
      ) : null}
      {game.phase === 'prep' && estimate.footfall > cap.perDay ? (
        <Notice
          tone="warn"
          title="Kapasiti mungkin tidak cukup"
          action={
            <Button size="sm" variant="secondary" icon={<Users className="size-4" aria-hidden="true" />} onClick={() => go('urus', 'staf')}>
              Urus staf
            </Button>
          }
        >
          Anggaran {estimate.footfall} pelanggan melebihi kapasiti {cap.perDay} pesanan sehari. Pelanggan mungkin beredar kerana barisan panjang.
        </Notice>
      ) : null}

      {/* Trend */}
      <Card>
        <CardTitle
          title="Untung bersih 7 hari"
          icon={<Gauge className="size-5" />}
          action={
            game.history.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => go('kewangan')}>
                Kewangan <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : null
          }
        />
        {game.history.length > 0 ? (
          <ProfitMiniChart data={historySeries(game.history, 7)} />
        ) : (
          <EmptyState icon={<ChartColumn className="size-6" />} title="Belum ada data">
            Buka kafe untuk melihat prestasi harian anda di sini.
          </EmptyState>
        )}
      </Card>

      {/* Objectives */}
      <Card>
        <CardTitle
          title="Objektif seterusnya"
          subtitle={`${level.xp} XP${level.next ? ` · ${level.next.minXp - level.xp} XP lagi ke ${level.next.title}` : ' · Tahap maksimum'}`}
          icon={<Target className="size-5" />}
          action={
            <Button size="sm" variant="ghost" onClick={() => go('urus', 'objektif')}>
              Semua <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        {nextObjectives.length > 0 ? (
          <ul className="space-y-3">
            {nextObjectives.map((o) => (
              <li key={o.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-espresso-800">{o.title}</p>
                  <Badge tone="info">+{o.xp} XP</Badge>
                </div>
                <p className="text-sm text-espresso-600">{o.description}</p>
                <ProgressBar value={o.current} max={o.target} label={`Kemajuan ${o.title}`} className="mt-1.5" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-espresso-700">Semua objektif telah dicapai. Anda benar-benar seorang tycoon kafe!</p>
        )}
      </Card>

      <p className="px-2 text-center text-xs text-espresso-600">
        Semua angka dalam permainan ini ialah data simulasi rekaan, bukan data perniagaan atau pasaran sebenar.
      </p>
    </div>
  );
}
