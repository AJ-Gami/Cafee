import { BadgeCheck, CircleAlert, Clock, Receipt, Scale, Sparkles, Target, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type Tone } from '../../components/Badge';
import { Card, CardTitle, Row } from '../../components/Card';
import { Money } from '../../components/Money';
import { ProductIcon } from '../../components/ProductIcon';
import { ProgressBar } from '../../components/ProgressBar';
import { EVENTS } from '../../game/data/events';
import { PRODUCTS } from '../../game/data/products';
import { PROMOTIONS } from '../../game/data/promotions';
import { formatHour } from '../../game/demand';
import { objectiveDef } from '../../game/objectives';
import { cashFlowSummary, reconcileReport } from '../../game/reports';
import type { DayReport, TimelineTone, TransactionType } from '../../game/types';
import { ResultCard } from './ResultCard';

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
        <li key={t.id} className="flex items-center gap-3 py-2">
          <Badge tone={TX_LABEL[t.type].tone} className="w-24 justify-center">
            {TX_LABEL[t.type].label}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-sm text-espresso-700">{t.label}</span>
          <Money sen={t.amountSen} signed colored className="text-sm font-semibold" />
        </li>
      ))}
    </ul>
  );
}

export function DayReportView({ report }: { report: DayReport }) {
  const e = report.expenses;
  const cash = cashFlowSummary(report);
  const rec = reconcileReport(report);
  const c = report.customers;
  const lost = c.lostCapacity + c.lostStock + c.lostPrice + c.lostClosed;

  return (
    <div className="space-y-4">
      <ResultCard report={report} />

      {report.eventId ? (
        <Card>
          <CardTitle title={EVENTS[report.eventId].title} subtitle="Peristiwa hari ini" icon={<Sparkles className="size-5" />} />
          <p className="text-[15px] text-espresso-700">{EVENTS[report.eventId].description}</p>
          {report.eventOutcome ? <p className="mt-2 text-[15px] font-semibold text-espresso-800">{report.eventOutcome}</p> : null}
        </Card>
      ) : null}

      <Card>
        <CardTitle title="Untung & rugi" subtitle="Penyata pendapatan hari ini" icon={<Receipt className="size-5" />} />
        <dl className="divide-y divide-espresso-800/[0.07]">
          <Row label="Hasil jualan" value={<Money sen={report.revenueSen} />} />
          {report.otherIncomeSen > 0 ? <Row label="Pendapatan lain" value={<Money sen={report.otherIncomeSen} />} /> : null}
          <Row label="Kos barang dijual" value={<Money sen={-report.cogsSen} />} />
          <Row label="Untung kasar" value={<Money sen={report.grossProfitSen} />} strong />
          <Row label="Gaji" value={<Money sen={-e.wagesSen} />} />
          <Row label="Sewa" value={<Money sen={-e.rentSen} />} />
          <Row label="Utiliti" value={<Money sen={-e.utilitiesSen} />} />
          <Row label="Pemasaran" value={<Money sen={-e.marketingSen} />} />
          <Row label="Lain-lain" value={<Money sen={-e.otherSen} />} />
          {e.hiringSen > 0 ? <Row indent muted label="Kos pengambilan staf" value={<Money sen={-e.hiringSen} />} /> : null}
          {e.eventCostSen > 0 ? <Row indent muted label="Kos peristiwa" value={<Money sen={-e.eventCostSen} />} /> : null}
          {e.spoilageSen > 0 ? <Row indent muted label="Pembaziran stok rosak" value={<Money sen={-e.spoilageSen} />} /> : null}
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
          <Row label="Tunai akhir hari" value={<Money sen={report.closingCashSen} />} strong />
        </dl>
        <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-espresso-700">
          <p>
            Inventori: <Money sen={report.openingInventorySen} /> → <Money sen={report.closingInventorySen} />. Stok yang belum dijual
            bukan kos barang dijual.
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle title="Pelanggan" subtitle={`${c.arrivals} orang datang ke kafe`} icon={<Users className="size-5" />} />
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-espresso-700">Kadar servis</p>
          <p className="font-semibold">{Math.round(c.serviceRate * 100)}%</p>
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
                  {l.sold} terjual @ <Money sen={l.salePriceSen} /> · kos <Money sen={l.cogsSen} /> · baki {l.closingStock}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {l.unmetStockout > 0 ? <Badge tone="bad">{l.unmetStockout} permintaan tak dipenuhi</Badge> : null}
                  {l.spoiledUnits > 0 ? (
                    <Badge tone="warn">
                      {l.spoiledUnits} rosak (<Money sen={l.spoiledValueSen} />)
                    </Badge>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

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
