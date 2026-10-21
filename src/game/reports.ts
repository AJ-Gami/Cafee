/**
 * Report reconciliation: proves a day report agrees with its underlying
 * transactions and inventory movements. Used by tests and shown in the UI.
 */
import { reputationPoints } from './demand';
import { sumSen } from './money';
import type { DayReport, TransactionType } from './types';

export interface ReconciliationCheck {
  id: string;
  label: string;
  expectedSen: number;
  actualSen: number;
  ok: boolean;
}

export interface Reconciliation {
  ok: boolean;
  checks: ReconciliationCheck[];
}

/** Cash payments for running the café (loan interest included; principal is financing). */
const OPERATING_PAYMENT_TYPES: readonly TransactionType[] = ['wages', 'rent', 'utilities', 'marketing', 'hiring', 'event_cost', 'loan_interest'];

function txTotal(report: DayReport, ...types: TransactionType[]): number {
  return sumSen(report.transactions.filter((t) => types.includes(t.type)).map((t) => t.amountSen));
}

export function reconcileReport(report: DayReport): Reconciliation {
  const e = report.expenses;
  const lineRevenue = sumSen(report.products.map((l) => l.revenueSen));
  const lineCogs = sumSen(report.products.map((l) => l.cogsSen));
  const lineSpoilage = sumSen(report.products.map((l) => l.spoiledValueSen));
  const allTx = sumSen(report.transactions.map((t) => t.amountSen));

  const checks: ReconciliationCheck[] = [
    {
      id: 'cash',
      label: 'Tunai awal + semua transaksi = tunai akhir',
      expectedSen: report.closingCashSen,
      actualSen: report.openingCashSen + allTx,
    },
    {
      id: 'revenue',
      label: 'Transaksi jualan = hasil jualan produk',
      expectedSen: report.revenueSen,
      actualSen: txTotal(report, 'sale'),
    },
    {
      id: 'revenue-lines',
      label: 'Jumlah jualan setiap produk = hasil jualan',
      expectedSen: report.revenueSen,
      actualSen: lineRevenue,
    },
    {
      id: 'cogs',
      label: 'Kos barang dijual = jumlah kos setiap produk',
      expectedSen: report.cogsSen,
      actualSen: lineCogs,
    },
    {
      id: 'expenses',
      label: 'Jumlah perbelanjaan = gaji + sewa + utiliti + pemasaran + lain-lain',
      expectedSen: report.totalExpensesSen,
      actualSen: e.wagesSen + e.rentSen + e.utilitiesSen + e.marketingSen + e.otherSen,
    },
    {
      id: 'expenses-cash',
      label: 'Perbelanjaan tunai = transaksi perbelanjaan',
      expectedSen: e.wagesSen + e.rentSen + e.utilitiesSen + e.marketingSen + e.hiringSen + e.eventCostSen + e.interestSen,
      actualSen: -txTotal(report, ...OPERATING_PAYMENT_TYPES),
    },
    {
      id: 'other',
      label: 'Lain-lain = pengambilan + kos peristiwa + pembaziran + faedah',
      expectedSen: e.otherSen,
      actualSen: e.hiringSen + e.eventCostSen + lineSpoilage + e.interestSen,
    },
    {
      id: 'net',
      label: 'Untung bersih = hasil + pendapatan lain − kos barang − perbelanjaan',
      expectedSen: report.netProfitSen,
      actualSen: report.revenueSen + report.otherIncomeSen - report.cogsSen - report.totalExpensesSen,
    },
    {
      id: 'inventory',
      label: 'Inventori awal + belian − kos barang dijual − pembaziran = inventori akhir',
      expectedSen: report.closingInventorySen,
      actualSen: report.openingInventorySen + report.stockPurchasesSen - report.cogsSen - e.spoilageSen,
    },
    {
      id: 'financing',
      label: 'Transaksi pinjaman = pinjaman diterima − bayaran pokok',
      expectedSen: report.loanProceedsSen - report.loanPrincipalRepaidSen,
      actualSen: txTotal(report, 'loan_proceeds', 'loan_principal'),
    },
    {
      id: 'debt',
      label: 'Hutang awal + pinjaman baharu − bayaran pokok = hutang akhir',
      expectedSen: report.closingDebtSen,
      actualSen: report.openingDebtSen + report.loanProceedsSen - report.loanPrincipalRepaidSen,
    },
    {
      id: 'bridge',
      label: 'Untung bersih − kenaikan inventori − pelaburan + pinjaman bersih = perubahan tunai',
      expectedSen: report.closingCashSen - report.openingCashSen,
      actualSen:
        report.netProfitSen -
        (report.closingInventorySen - report.openingInventorySen) -
        report.capexSen +
        report.loanProceedsSen -
        report.loanPrincipalRepaidSen,
    },
  ].map((c) => ({ ...c, ok: c.expectedSen === c.actualSen }));

  return { ok: checks.every((c) => c.ok), checks };
}

export interface CashFlowSummary {
  salesReceiptsSen: number;
  otherIncomeSen: number;
  stockPurchasesSen: number;
  /** Wages, rent, utilities, marketing, hiring, event costs and loan interest. */
  operatingPaymentsSen: number;
  capexSen: number;
  loanProceedsSen: number;
  loanPrincipalRepaidSen: number;
  netChangeSen: number;
}

export function cashFlowSummary(report: DayReport): CashFlowSummary {
  return {
    salesReceiptsSen: txTotal(report, 'sale'),
    otherIncomeSen: txTotal(report, 'event_income'),
    stockPurchasesSen: report.stockPurchasesSen,
    operatingPaymentsSen: -txTotal(report, ...OPERATING_PAYMENT_TYPES),
    capexSen: report.capexSen,
    loanProceedsSen: report.loanProceedsSen,
    loanPrincipalRepaidSen: report.loanPrincipalRepaidSen,
    netChangeSen: report.closingCashSen - report.openingCashSen,
  };
}

/** Plain-text summary for sharing. Clearly labelled as simulated game data. */
export function shareText(report: DayReport, formatMoney: (sen: number) => string): string {
  return [
    `☕ ${report.cafeName} — Hari ${report.day}`,
    `Jualan: ${formatMoney(report.revenueSen)}`,
    `Untung bersih: ${formatMoney(report.netProfitSen)}`,
    `Pelanggan dilayan: ${report.customers.served}`,
    `Reputasi: ${reputationPoints(report.reputationAfter)}/100`,
    '',
    'REAL LIFE TYCOON: Café Empire (data simulasi permainan)',
  ].join('\n');
}

export interface HistoryPoint {
  day: number;
  label: string;
  revenueSen: number;
  netProfitSen: number;
  closingCashSen: number;
  served: number;
}

/** Last `count` days for charts (values stay in sen). */
export function historySeries(history: readonly DayReport[], count: number): HistoryPoint[] {
  return history.slice(-count).map((r) => ({
    day: r.day,
    label: `H${r.day}`,
    revenueSen: r.revenueSen,
    netProfitSen: r.netProfitSen,
    closingCashSen: r.closingCashSen,
    served: r.customers.served,
  }));
}

/** Running totals by hour for the live day playback. */
export function cumulativeByHour(report: DayReport): { hour: number; served: number; revenueSen: number; lost: number }[] {
  let served = 0;
  let revenueSen = 0;
  let lost = 0;
  return report.hourly.map((h) => {
    served += h.served;
    revenueSen += h.revenueSen;
    lost += h.lostCapacity + h.lostStock + h.lostPrice + h.lostClosed;
    return { hour: h.hour, served, revenueSen, lost };
  });
}
