import { BadgeCheck, Lock, Minus, Plus, Store, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardTitle, Row } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { BRANCH_BARISTA_WAGE_SEN, BRANCH_MAX_BARISTAS } from '../../game/constants';
import { reputationPoints } from '../../game/demand';
import { branchLocationViews, branchViews, type BranchLocationView, type BranchUpgradeView, type BranchView } from '../../game/selectors';
import type { BranchLocationId } from '../../game/types';

export function BranchPanel({ locked }: { locked: boolean }) {
  const { game } = useGame();
  const views = branchViews(game);
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-espresso-600">
        Cawangan menjual menu yang sama pada harga dan promosi yang sama. Setiap pagi, setiap cawangan menerima bahan ikut anggarannya
        daripada stor pusat; kafe utama menggunakan bakinya. Isi semula ikut anggaran membeli untuk semua lokasi.
      </p>
      {views.map((v) => (
        <OpenBranch key={v.branch.location} view={v} locked={locked} />
      ))}
      <ChooseLocation locked={locked} />
    </div>
  );
}

function ChooseLocation({ locked }: { locked: boolean }) {
  const { game, dispatch } = useGame();
  const views = branchLocationViews(game).filter((v) => !v.open);
  const [target, setTarget] = useState<BranchLocationView | null>(null);
  const first = views[0];
  if (!first) return null;
  const required = first.requiredLevel;

  return (
    <>
      <h2 className="px-1 pt-1 font-display text-lg text-espresso-800">{game.branches.length > 0 ? 'Buka cawangan lain' : 'Buka cawangan'}</h2>
      {first.locked && required !== null ? (
        <Notice tone="info" title={`Cawangan ke-${game.branches.length + 1} dibuka pada Tahap ${required}`}>
          Capai objektif untuk naik tahap. Anda boleh meneliti lokasi di bawah sementara itu.
        </Notice>
      ) : null}
      {views.map((v) => (
        <Card key={v.id}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg leading-tight">{v.name}</h3>
            {v.locked && required !== null ? <Badge icon={<Lock className="size-3" aria-hidden="true" />}>Tahap {required}</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-espresso-600">{v.description}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {v.traits.map((t) => (
              <li key={t}>
                <Badge tone="info">{t}</Badge>
              </li>
            ))}
          </ul>
          <dl className="mt-2 divide-y divide-espresso-800/[0.07]">
            <Row label="Kos kelengkapan" value={<Money sen={v.setupCostSen} />} strong />
            <Row label="Bayaran tetap sehari (1 barista)" value={<Money sen={v.dailyFixedSen} />} />
            <Row label={`Susut nilai sehari (${v.lifeDays} hari)`} value={<Money sen={v.dailyDepreciationSen} />} muted />
          </dl>
          <Button className="mt-3" block variant="primary" disabled={locked || v.locked || !v.affordable} onClick={() => setTarget(v)}>
            {v.locked && required !== null ? `Buka di Tahap ${required}` : v.affordable ? `Buka cawangan di ${v.shortName}` : 'Tunai tak cukup'}
          </Button>
        </Card>
      ))}

      <ConfirmDialog
        open={target !== null}
        title={`Buka cawangan di ${target?.shortName ?? ''}?`}
        confirmLabel="Buka cawangan"
        tone="accent"
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (target) dispatch({ type: 'OPEN_BRANCH', location: target.id });
          setTarget(null);
        }}
      >
        {target ? (
          <>
            <p>
              <Money sen={target.setupCostSen} /> ditolak daripada tunai anda serta-merta untuk kelengkapan. Cawangan mula berniaga apabila
              kafe dibuka hari ini, dengan seorang barista.
            </p>
            <p className="mt-2 text-sm text-espresso-600">
              Setiap kali kafe ditutup: gaji, sewa dan utiliti cawangan kira-kira <Money sen={target.dailyFixedSen} />, serta susut nilai
              kelengkapan <Money sen={target.dailyDepreciationSen} /> (bukan tunai) selama {target.lifeDays} hari. Pembukaan boleh dibatalkan
              dengan bayaran balik penuh pada hari yang sama.
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function OpenBranch({ view, locked }: { view: BranchView; locked: boolean }) {
  const { dispatch } = useGame();
  const [closeOpen, setCloseOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<BranchUpgradeView | null>(null);
  const { def, branch } = view;
  const location: BranchLocationId = branch.location;
  const fixedTotal = view.fixed.wagesSen + view.fixed.rentSen + view.fixed.utilitiesBaseSen;
  const refundToday = view.openedToday;

  return (
    <>
      <Card className="border-sage-600/30 bg-sage-50">
        <CardTitle
          title={`Cawangan ${def.shortName}`}
          subtitle={`${def.name} · dibuka Hari ${branch.openedDay}`}
          icon={<Store className="size-5" />}
          action={<Badge tone="good">Reputasi {reputationPoints(branch.reputation)}</Badge>}
        />
        <dl className="divide-y divide-espresso-800/[0.07]">
          <Row label="Anggaran pelanggan hari ini" value={`~${view.estimatedFootfall}`} />
          <Row label="Kapasiti" value={`${view.capacityPerHour}/jam · ${view.capacityPerDay} sehari`} />
          <Row label="Bayaran tetap sehari" value={<Money sen={fixedTotal} />} />
          <Row label="Nilai buku aset cawangan" value={<Money sen={view.bookValueSen} />} />
          {view.dailyDepreciationSen > 0 ? <Row label="Susut nilai sehari" value={<Money sen={view.dailyDepreciationSen} />} muted /> : null}
        </dl>

        <div className="mt-3 rounded-xl bg-cream-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Barista cawangan</p>
          <div className="mt-1 flex items-center gap-3">
            <Button
              variant="secondary"
              className="w-11 px-0"
              aria-label={`Kurangkan barista cawangan ${def.shortName}`}
              disabled={locked || branch.baristas <= 1}
              onClick={() => dispatch({ type: 'SET_BRANCH_BARISTAS', location, baristas: branch.baristas - 1 })}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <p className="tabular min-w-0 flex-1 text-center text-2xl font-semibold" aria-live="polite">
              {branch.baristas}
            </p>
            <Button
              variant="secondary"
              className="w-11 px-0"
              aria-label={`Tambah barista cawangan ${def.shortName}`}
              disabled={locked || branch.baristas >= BRANCH_MAX_BARISTAS}
              onClick={() => dispatch({ type: 'SET_BRANCH_BARISTAS', location, baristas: branch.baristas + 1 })}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-1 text-sm text-espresso-600">
            <Money sen={BRANCH_BARISTA_WAGE_SEN} /> sehari setiap seorang, tanpa kos pengambilan. Berkuat kuasa apabila kafe dibuka.
          </p>
        </div>

        {view.stock.length > 0 ? (
          <div className="mt-3 rounded-xl bg-cream-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Stok cawangan pagi ini</p>
            <ul className="mt-1 space-y-1 text-sm text-espresso-700">
              {view.stock.map((l) => (
                <li key={l.ingredientId} className="flex justify-between gap-2">
                  <span>{l.name}</span>
                  <span className={`tabular text-right ${l.missing > 0 ? 'font-semibold text-rust-700' : ''}`}>
                    {l.stock} + {l.delivery} dihantar (perlu ~{Math.round(l.need)})
                  </span>
                </li>
              ))}
            </ul>
            {view.stock.some((l) => l.missing > 0) ? (
              <p className="mt-1 text-sm font-semibold text-rust-700">Stor pusat tidak cukup untuk semua penghantaran — beli lebih stok.</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Naik taraf cawangan</p>
          {view.upgrades.map((u) => (
            <div key={u.id} className="flex items-start gap-3 rounded-xl bg-cream-50 p-3">
              <span className="mt-0.5 text-espresso-600" aria-hidden="true">
                {u.owned ? <BadgeCheck className="size-5" /> : <Wrench className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-espresso-800">{u.name}</p>
                <p className="text-sm text-espresso-600">{u.effectSummary}</p>
                {u.owned && u.bookValueSen !== null ? (
                  <p className="text-xs text-espresso-600">
                    Nilai buku <Money sen={u.bookValueSen} />
                  </p>
                ) : null}
              </div>
              {u.owned ? (
                <Badge tone="good">Dimiliki</Badge>
              ) : (
                <Button size="sm" variant="secondary" disabled={locked || !u.affordable} onClick={() => setUpgradeTarget(u)}>
                  <span className="sr-only">
                    Beli {u.name} untuk {def.shortName},{' '}
                  </span>
                  <Money sen={u.costSen} trimZeroSen />
                </Button>
              )}
            </div>
          ))}
        </div>

        {view.lastResult ? (
          <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-espresso-700">
            <p className="font-semibold text-espresso-800">Hari {view.lastResult.day}</p>
            <p>
              {view.lastResult.customers.served} pelanggan · jualan <Money sen={view.lastResult.revenueSen} /> · sumbangan{' '}
              <Money sen={view.lastResult.contributionSen} colored />
            </p>
          </div>
        ) : null}

        <Button className="mt-3" block variant="secondary" disabled={locked} onClick={() => setCloseOpen(true)}>
          {refundToday ? `Batalkan pembukaan cawangan ${def.shortName}` : `Tutup cawangan ${def.shortName}`}
        </Button>
      </Card>

      <ConfirmDialog
        open={upgradeTarget !== null}
        title={`Beli ${upgradeTarget?.name ?? ''}?`}
        confirmLabel="Beli naik taraf"
        onCancel={() => setUpgradeTarget(null)}
        onConfirm={() => {
          if (upgradeTarget) dispatch({ type: 'BUY_BRANCH_UPGRADE', location, upgradeId: upgradeTarget.id });
          setUpgradeTarget(null);
        }}
      >
        {upgradeTarget ? (
          <p>
            <Money sen={upgradeTarget.costSen} /> untuk cawangan {def.shortName}: {upgradeTarget.description} Disusutnilaikan kira-kira{' '}
            <Money sen={upgradeTarget.dailyDepreciationSen} /> sehari selama {upgradeTarget.lifeDays} hari.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={closeOpen}
        title={refundToday ? 'Batalkan pembukaan cawangan?' : `Tutup cawangan ${def.shortName}?`}
        confirmLabel={refundToday ? 'Batalkan pembukaan' : 'Tutup cawangan'}
        onCancel={() => setCloseOpen(false)}
        onConfirm={() => {
          dispatch({ type: 'CLOSE_BRANCH', location });
          setCloseOpen(false);
        }}
      >
        {refundToday ? (
          <p>Cawangan dibuka hari ini, jadi kos kelengkapan dan naik tarafnya dikembalikan sepenuhnya. Stoknya dipulangkan ke stor pusat.</p>
        ) : (
          <p>
            Cawangan tidak akan dibuka lagi dan stoknya dipulangkan ke stor pusat. Baki nilai buku aset cawangan (<Money sen={view.bookValueSen} />)
            dihapus kira sebagai perbelanjaan bukan tunai semasa kafe ditutup hari ini. Tindakan ini tidak boleh dibatalkan.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
