import { BadgeCheck, CircleAlert, Clock, Package, Receipt, Scale, Sparkles, Store, Target, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type Tone } from '../../components/Badge';
import { Card, CardTitle, Row } from '../../components/Card';
import { IngredientIcon } from '../../components/IngredientIcon';
import { Money } from '../../components/Money';
import { ProductIcon } from '../../components/ProductIcon';
import { ProgressBar } from '../../components/ProgressBar';
import { BRANCH_LOCATIONS } from '../../game/data/branches';
import { EVENTS } from '../../game/data/events';
import { INGREDIENTS } from '../../game/data/ingredients';
import { PRODUCTS } from '../../game/data/products';
import { PROMOTIONS } from '../../game/data/promotions';
import { formatHour, percentPoints } from '../../game/demand';
import { objectiveDef } from '../../game/objectives';
import { cashFlowSummary, reconcileReport, type WeeklySummary } from '../../game/reports';
import type { BranchDayResult, DayReport, TimelineTone, TransactionType } from '../../game/types';
import { ResultCard } from './ResultCard';
import { WeekSummaryCard } from './WeekSummary';

export const TX_LABEL: Record<TransactionType, { label: string; tone: Tone }> = {
  stock_purchase: { label: 'Stok', tone: 'neutral' },
  sale: { label: 'Jualan', tone: 'good' },
  wages: { label: 'Gaji', tone: 'neutral' },
  rent: { label: 'Sewa', tone: 'neutral' },
  utilities: { label: 'Utiliti', tone: 'neutral' },
  marketing: { label: 'Pemasaran', tone: 'info' },
  event_cost: { label: 'Peristiwa', tone: 'bad' },
  event_income: { label: 'Pendapatan lain', tone: 'good' },
  hiring: { label: 'Pengambilan', tone: 'neutral' },
  upgrade: { label: 'Naik taraf', tone: 'info' },
  loan_proceeds: { label: 'Pinjaman', tone: 'info' },
  loan_interest: { label: 'Faedah', tone: 'bad' },
  loan_principal: { label: 'Bayar pinjaman', tone: 'neutral' },
  branch_setup: { label: 'Cawangan', tone: 'info' },
};

const TONE_DOT: Record<TimelineTone, string> = {
  neutral: 'bg-espresso-500',
  good: 'bg-sage-600',
  warn: 'bg-honey-700',
  bad: 'bg-rust-600',
};

function Disclosure({ title, icon, children, defaultOpen = false }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-2xl border border-espresso-800/[0.07] bg-cream-50 shadow-card" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 font-display text-lg text-espresso-800 [&::-webkit-details-marker]:hidden">
        <span className="text-espresso-600">{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="text-espresso-600 transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function TransactionList({ transactions }: { transactions: DayReport['transactions'] }) {
  return (
    <ul className="divide-y divide-espresso-800/[0.07]">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-2">
          <Badge tone={TX_LABEL[t.type].tone} className="mt-0.5 w-24 shrink-0 justify-center">
            {TX_LABEL[t.type].label}
          </Badge>
          <span className="min-w-0 flex-1 break-words text-sm text-espresso-700">{t.label}</span>
          <Money sen={t.amountSen} signed colored className="text-sm font-semibold" />
        </li>
      ))}
    </ul>
  );
}

/** `week` is the summary of the week this day completes (shown on every 7th day's report). */
export function DayReportView({ report, week = null }: { report: DayReport; week?: WeeklySummary | null }) {
  const e = report.expenses;
  const cash = cashFlowSummary(report);
  const rec = reconcileReport(report);
  const c = report.customers;
  const lost = c.lostCapacity + c.lostStock + c.lostPrice + c.lostClosed;

  return (
    <div className="space-y-4">
      <ResultCard report={report} />

      {week ? <WeekSummaryCard summary={week} closing /> : null}

      {report.branches.map((b) => (
        <BranchDayCard key={b.location} branch={b} />
      ))}

      {report.eventId ? (
        <Card>
          <CardTitle title={EVENTS[report.eventId].title} subtitle="Peristiwa hari ini" icon={<Sparkles className="size-5" />} />
          <p className="text-[15px] text-espresso-700">{EVENTS[report.eventId].description}</p>
          {report.eventOutcome ? <p className="mt-2 text-[15px] font-semibold text-espresso-800">{report.eventOutcome}</p> : null}
        </Card>
      ) : null}

      <Card>
        <CardTitle
          title="Untung & rugi"
          subtitle={report.branches.length > 0 ? 'Penyata pendapatan hari ini (kafe utama dan cawangan)' : 'Penyata pendapatan hari ini'}
          icon={<Receipt className="size-5" />}
        />
        <dl className="divide-y divide-espresso-800/[0.07]">
          <Row label="Hasil jualan" value={<Money sen={report.revenueSen} />} />
          {report.otherIncomeSen > 0 ? <Row label="Pendapatan lain" value={<Money sen={report.otherIncomeSen} />} /> : null}
          <Row label="Kos barang dijual" value={<Money sen={-report.cogsSen} />} />
          <Row label="Untung kasar" value={<Money sen={report.grossProfitSen} />} strong />
          <Row label="Gaji" value={<Money sen={-e.wagesSen} />} />
          <Row label="Sewa" value={<Money sen={-e.rentSen} />} />
          <Row label="Utiliti" value={<Money sen={-e.utilitiesSen} />} />
          <Row label="Pemasaran" value={<Money sen={-e.marketingSen} />} />
          {e.depreciationSen > 0 ? <Row label="Susut nilai aset (bukan tunai)" value={<Money sen={-e.depreciationSen} />} /> : null}
          <Row label="Lain-lain" value={<Money sen={-e.otherSen} />} />
          {e.hiringSen > 0 ? <Row indent muted label="Kos pengambilan staf" value={<Money sen={-e.hiringSen} />} /> : null}
          {e.eventCostSen > 0 ? <Row indent muted label="Kos peristiwa" value={<Money sen={-e.eventCostSen} />} /> : null}
          {e.spoilageSen > 0 ? <Row indent muted label="Pembaziran stok rosak" value={<Money sen={-e.spoilageSen} />} /> : null}
          {e.interestSen > 0 ? <Row indent muted label="Faedah pinjaman" value={<Money sen={-e.interestSen} />} /> : null}
          {e.writeOffSen > 0 ? <Row indent muted label="Hapus kira cawangan ditutup" value={<Money sen={-e.writeOffSen} />} /> : null}
          <Row label="Jumlah perbelanjaan" value={<Money sen={-report.totalExpensesSen} />} strong />
          <Row label="Untung bersih" value={<Money sen={report.netProfitSen} colored className="text-lg" />} strong />
        </dl>
      </Card>

      <Card>
        <CardTitle title="Aliran tunai" subtitle="Belian stok mengurangkan tunai serta-merta" icon={<Scale className="size-5" />} />
        <dl className="divide-y divide-espresso-800/[0.07]">
          <Row label="Tunai awal hari" value={<Money sen={report.openingCashSen} />} />
          <Row label="Terimaan jualan" value={<Money sen={cash.salesReceiptsSen} signed />} />
          {cash.otherIncomeSen > 0 ? <Row label="Pendapatan lain" value={<Money sen={cash.otherIncomeSen} signed />} /> : null}
          <Row label="Belian stok" value={<Money sen={-cash.stockPurchasesSen} />} />
          <Row label="Bayaran operasi" value={<Money sen={-cash.operatingPaymentsSen} />} />
          {cash.capexSen > 0 ? <Row label="Pelaburan naik taraf" value={<Money sen={-cash.capexSen} />} /> : null}
          {cash.loanProceedsSen > 0 ? <Row label="Pinjaman diterima" value={<Money sen={cash.loanProceedsSen} signed />} /> : null}
          {cash.loanPrincipalRepaidSen > 0 ? <Row label="Bayaran balik pokok pinjaman" value={<Money sen={-cash.loanPrincipalRepaidSen} />} /> : null}
          <Row label="Tunai akhir hari" value={<Money sen={report.closingCashSen} />} strong />
        </dl>
        {report.openingDebtSen > 0 || report.closingDebtSen > 0 ? (
          <p className="mt-2 text-sm text-espresso-700">
            Baki pinjaman: <Money sen={report.openingDebtSen} /> → <Money sen={report.closingDebtSen} />. Bayaran pokok ialah pembiayaan, bukan
            perbelanjaan; hanya faedah ditolak daripada untung.
          </p>
        ) : null}
        <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-espresso-700">
          <p>
            Inventori: <Money sen={report.openingInventorySen} /> → <Money sen={report.closingInventorySen} />. Stok yang belum dijual
            bukan kos barang dijual.
          </p>
          {report.openingAssetsSen > 0 || report.closingAssetsSen > 0 ? (
            <p className="mt-1">
              Aset tetap (nilai buku): <Money sen={report.openingAssetsSen} /> → <Money sen={report.closingAssetsSen} />. Pelaburan
              mengurangkan tunai hari ini; kosnya ditolak daripada untung sedikit demi sedikit sebagai susut nilai.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardTitle title="Pelanggan" subtitle={`${c.arrivals} orang datang ke kafe`} icon={<Users className="size-5" />} />
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-espresso-700">Kadar servis</p>
          <p className="font-semibold">{percentPoints(c.serviceRate)}%</p>
        </div>
        <ProgressBar value={c.serviceRate} label="Kadar servis" tone={c.serviceRate >= 0.85 ? 'sage' : c.serviceRate >= 0.7 ? 'honey' : 'rust'} className="mt-1" />
        <dl className="mt-3 divide-y divide-espresso-800/[0.07]">
          <Row label="Dilayan" value={c.served} strong />
          <Row label="Beredar — barisan terlalu panjang" value={c.lostCapacity} />
          <Row label="Beredar — produk habis stok" value={c.lostStock} />
          <Row label="Beredar — harga terlalu mahal" value={c.lostPrice} />
          {c.lostClosed > 0 ? <Row label="Tidak dilayan — kafe tutup" value={c.lostClosed} /> : null}
          <Row label="Jumlah tidak membeli" value={lost} muted />
        </dl>
        <p className="mt-2 text-sm text-espresso-600">
          Reputasi: {report.reputationBefore} → {report.reputationAfter}. Promosi: {PROMOTIONS[report.promotionId].name}
          {report.promotionSkipped ? ' (promosi pilihan dibatalkan kerana tunai tidak cukup)' : ''}.
        </p>
      </Card>

      <Card>
        <CardTitle title="Prestasi produk" icon={<Receipt className="size-5" />} />
        <ul className="space-y-3">
          {report.products.map((l) => (
            <li key={l.productId} className="flex items-start gap-3">
              <ProductIcon id={l.productId} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{PRODUCTS[l.productId].name}</p>
                  <Money sen={l.revenueSen} className="font-semibold" />
                </div>
                <p className="text-sm text-espresso-600">
                  {l.sold} terjual @ <Money sen={l.salePriceSen} /> · {report.ingredients ? 'kos bahan' : 'kos'} <Money sen={l.cogsSen} />
                  {l.closingStock !== undefined ? ` · baki ${l.closingStock}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {l.unmetStockout > 0 ? <Badge tone="bad">{l.unmetStockout} permintaan tak dipenuhi</Badge> : null}
                  {l.spoiledUnits ? (
                    <Badge tone="warn">
                      {l.spoiledUnits} rosak (<Money sen={l.spoiledValueSen ?? 0} />)
                    </Badge>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {report.ingredients ? (
        <Card>
          <CardTitle title="Bahan" subtitle="Pergerakan stok bahan hari ini" icon={<Package className="size-5" />} />
          <ul className="space-y-3">
            {report.ingredients.map((l) => (
              <li key={l.ingredientId} className="flex items-start gap-3">
                <IngredientIcon id={l.ingredientId} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{INGREDIENTS[l.ingredientId].name}</p>
                    <p className="tabular text-sm font-semibold">
                      baki {l.closingStock} {INGREDIENTS[l.ingredientId].unitLabel}
                    </p>
                  </div>
                  <p className="text-sm text-espresso-600">
                    dibeli {l.purchased} · digunakan {l.used} (<Money sen={l.usedValueSen} />)
                  </p>
                  {l.spoiled > 0 ? (
                    <div className="mt-1">
                      <Badge tone="warn">
                        {l.spoiled} rosak (<Money sen={l.spoiledValueSen} />)
                      </Badge>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {report.objectivesCompleted.length > 0 ? (
        <Card>
          <CardTitle title="Objektif dicapai" icon={<Target className="size-5" />} />
          <ul className="space-y-2">
            {report.objectivesCompleted.map((id) => {
              const def = objectiveDef(id);
              return (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{def.title}</span>
                  <Badge tone="good">+{def.xp} XP</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Disclosure title="Garis masa hari" icon={<Clock className="size-5" />}>
        <ol className="space-y-2.5">
          {report.timeline.map((t, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="tabular w-12 shrink-0 font-semibold text-espresso-600">{formatHour(t.hour)}</span>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[t.tone]}`} aria-hidden="true" />
              <span className="text-espresso-800">{t.text}</span>
            </li>
          ))}
        </ol>
      </Disclosure>

      <Disclosure title={`Transaksi (${report.transactions.length})`} icon={<Receipt className="size-5" />}>
        <TransactionList transactions={report.transactions} />
      </Disclosure>

      <Disclosure title={rec.ok ? 'Semakan laporan: seimbang' : 'Semakan laporan: ada percanggahan'} icon={rec.ok ? <BadgeCheck className="size-5" /> : <CircleAlert className="size-5" />}>
        <p className="mb-2 text-sm text-espresso-600">Setiap angka disemak semula terhadap transaksi dan pergerakan inventori.</p>
        <ul className="space-y-2">
          {rec.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-sage-700" aria-label="Lulus" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rust-700" aria-label="Gagal" />
              )}
              <span className="flex-1 text-espresso-700">{check.label}</span>
              <Money sen={check.actualSen} className="text-espresso-800" />
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

function BranchDayCard({ branch: b }: { branch: BranchDayResult }) {
  const def = BRANCH_LOCATIONS[b.location];
  return (
    <Card>
      <CardTitle
        title={`Cawangan ${def.shortName}`}
        subtitle={`${b.customers.served} daripada ${b.customers.arrivals} pelanggan dilayan · ${b.baristas} barista`}
        icon={<Store className="size-5" />}
      />
      <dl className="divide-y divide-espresso-800/[0.07]">
        <Row label="Hasil jualan" value={<Money sen={b.revenueSen} />} />
        <Row label="Kos barang dijual" value={<Money sen={-b.cogsSen} />} />
        <Row label="Gaji" value={<Money sen={-b.wagesSen} />} />
        <Row label="Sewa" value={<Money sen={-b.rentSen} />} />
        <Row label="Utiliti" value={<Money sen={-b.utilitiesSen} />} />
        {b.spoilageSen > 0 ? <Row label="Pembaziran stok cawangan" value={<Money sen={-b.spoilageSen} />} /> : null}
        <Row label="Sumbangan cawangan" value={<Money sen={b.contributionSen} colored />} strong />
      </dl>
      <p className="mt-2 text-sm text-espresso-600">
        Sudah termasuk dalam jumlah syarikat di atas. Sumbangan belum ditolak susut nilai kelengkapan dan naik taraf cawangan. Reputasi
        cawangan: {b.reputationBefore} → {b.reputationAfter}.
        {b.customers.lostStock > 0 ? ` ${b.customers.lostStock} pelanggan beredar kerana bahan cawangan habis.` : ''}
      </p>
    </Card>
  );
}
