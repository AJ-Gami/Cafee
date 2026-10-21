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

// ---------------------------------------------------------------------------
// Weekly summaries (week 1 = days 1–7, Monday to Sunday)
// ---------------------------------------------------------------------------

export const DAYS_PER_WEEK = 7;

export function weekOfDay(day: number): number {
  return Math.ceil(day / DAYS_PER_WEEK);
}

export function isWeekEnd(day: number): boolean {
  return day % DAYS_PER_WEEK === 0;
}

export interface WeekComparison {
  /** Revenue change in whole percent, or null when last week had no revenue. */
  revenueChangePct: number | null;
  netProfitChangeSen: number;
  servedChange: number;
}

export interface WeeklySummary {
  week: number;
  firstDay: number;
  lastDay: number;
  /** Days of this week present in the report history. */
  daysPlayed: number;
  /** All seven days are present. */
  complete: boolean;
  /** The latest week, still being played. (An older incomplete week was cut off by the history limit.) */
  inProgress: boolean;
  revenueSen: number;
  otherIncomeSen: number;
  cogsSen: number;
  totalExpensesSen: number;
  netProfitSen: number;
  openingCashSen: number;
  closingCashSen: number;
  served: number;
  arrivals: number;
  /** Served / customers willing to buy, over the whole week. 0..1 */
  serviceRate: number;
  profitableDays: number;
  bestDay: { day: number; revenueSen: number };
  reputationStart: number;
  reputationEnd: number;
  /** Against the previous week, only when both weeks are complete. */
  vsPrevious: WeekComparison | null;
}

function summarizeWeek(week: number, days: readonly DayReport[], latestDay: number): Omit<WeeklySummary, 'vsPrevious'> {
  const first = days[0] as DayReport;
  const last = days[days.length - 1] as DayReport;
  const total = (pick: (r: DayReport) => number): number => sumSen(days.map(pick));
  const served = days.reduce((n, r) => n + r.customers.served, 0);
  const willing = days.reduce((n, r) => n + r.customers.served + r.customers.lostCapacity + r.customers.lostStock + r.customers.lostClosed, 0);
  const best = days.reduce((a, b) => (b.revenueSen > a.revenueSen ? b : a));
  return {
    week,
    firstDay: (week - 1) * DAYS_PER_WEEK + 1,
    lastDay: week * DAYS_PER_WEEK,
    daysPlayed: days.length,
    complete: days.length === DAYS_PER_WEEK,
    inProgress: days.length < DAYS_PER_WEEK && week * DAYS_PER_WEEK > latestDay,
    revenueSen: total((r) => r.revenueSen),
    otherIncomeSen: total((r) => r.otherIncomeSen),
    cogsSen: total((r) => r.cogsSen),
    totalExpensesSen: total((r) => r.totalExpensesSen),
    netProfitSen: total((r) => r.netProfitSen),
    openingCashSen: first.openingCashSen,
    closingCashSen: last.closingCashSen,
    served,
    arrivals: days.reduce((n, r) => n + r.customers.arrivals, 0),
    serviceRate: willing === 0 ? 1 : served / willing,
    profitableDays: days.filter((r) => r.netProfitSen > 0).length,
    bestDay: { day: best.day, revenueSen: best.revenueSen },
    reputationStart: first.reputationBefore,
    reputationEnd: last.reputationAfter,
  };
}

/** One summary per week present in the history, oldest first. */
export function weeklySummaries(history: readonly DayReport[]): WeeklySummary[] {
  const byWeek = new Map<number, DayReport[]>();
  for (const r of history) {
    const w = weekOfDay(r.day);
    const list = byWeek.get(w);
    if (list) list.push(r);
    else byWeek.set(w, [r]);
  }
  const latestDay = history.reduce((max, r) => Math.max(max, r.day), 0);
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a - b).map(([w, days]) => summarizeWeek(w, days, latestDay));
  return weeks.map((cur, i) => {
    const prev = weeks[i - 1];
    const comparable = prev !== undefined && prev.week === cur.week - 1 && prev.complete && cur.complete;
    return {
      ...cur,
      vsPrevious: comparable
        ? {
            revenueChangePct: prev.revenueSen > 0 ? Math.round(((cur.revenueSen - prev.revenueSen) * 100) / prev.revenueSen) : null,
            netProfitChangeSen: cur.netProfitSen - prev.netProfitSen,
            servedChange: cur.served - prev.served,
          }
        : null,
    };
  });
}

/** The summary of the week that ends on `day` (every 7th day), if that day is in the history. */
export function weekEndingOn(history: readonly DayReport[], day: number): WeeklySummary | null {
  if (!isWeekEnd(day) || !history.some((r) => r.day === day)) return null;
  return weeklySummaries(history).find((w) => w.lastDay === day) ?? null;
}
