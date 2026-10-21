/**
 * Report reconciliation: proves a day report agrees with its underlying
 * transactions and inventory movements. Used by tests and shown in the UI.
 */
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
      expectedSen: e.wagesSen + e.rentSen + e.utilitiesSen + e.marketingSen + e.hiringSen + e.eventCostSen,
      actualSen: -txTotal(report, 'wages', 'rent', 'utilities', 'marketing', 'hiring', 'event_cost'),
    },
    {
      id: 'other',
      label: 'Lain-lain = pengambilan + kos peristiwa + pembaziran',
      expectedSen: e.otherSen,
      actualSen: e.hiringSen + e.eventCostSen + lineSpoilage,
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
      id: 'bridge',
      label: 'Untung bersih − kenaikan inventori − pelaburan = perubahan tunai',
      expectedSen: report.closingCashSen - report.openingCashSen,
      actualSen:
        report.netProfitSen - (report.closingInventorySen - report.openingInventorySen) - report.capexSen,
    },
  ].map((c) => ({ ...c, ok: c.expectedSen === c.actualSen }));

  return { ok: checks.every((c) => c.ok), checks };
}

export interface CashFlowSummary {
  salesReceiptsSen: number;
  otherIncomeSen: number;
  stockPurchasesSen: number;
  operatingPaymentsSen: number;
  capexSen: number;
  netChangeSen: number;
}

export function cashFlowSummary(report: DayReport): CashFlowSummary {
  const operatingPaymentsSen = -txTotal(report, 'wages', 'rent', 'utilities', 'marketing', 'hiring', 'event_cost');
  return {
    salesReceiptsSen: txTotal(report, 'sale'),
    otherIncomeSen: txTotal(report, 'event_income'),
    stockPurchasesSen: report.stockPurchasesSen,
    operatingPaymentsSen,
    capexSen: report.capexSen,
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
    `Reputasi: ${Math.round(report.reputationAfter)}/100`,
    '',
    'REAL LIFE TYCOON: Café Empire (data simulasi permainan)',
  ].join('\n');
}
