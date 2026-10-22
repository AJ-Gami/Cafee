/**
 * Runtime validation for loaded save data. Anything read from localStorage is
 * untrusted: it may be truncated, hand-edited or from another version.
 */
import {
  CAFE_NAME_MAX_LENGTH,
  GOAL_BASE_DAYS,
  GOAL_MIN_BASE_DAYS,
  GOAL_MIN_TARGET_SEN,
  MAX_PRICE_SEN,
  MAX_STOCK_PER_PRODUCT,
  MIN_PRICE_SEN,
  SAVE_SCHEMA_VERSION,
} from './constants';
import { EVENTS } from './data/events';
import { LOAN_OFFERS } from './data/loans';
import { OBJECTIVES } from './data/objectives';
import { PROMOTIONS } from './data/promotions';
import { UPGRADES } from './data/upgrades';
import { goalKindFor } from './goals';
import { installment, remainingPrincipal } from './loans';
import type { ActiveLoan, EventId, GameState } from './types';
import { PRODUCT_IDS } from './types';

type Obj = Record<string, unknown>;

const TX_TYPES = new Set([
  'stock_purchase',
  'sale',
  'wages',
  'rent',
  'utilities',
  'marketing',
  'event_cost',
  'event_income',
  'hiring',
  'upgrade',
  'loan_proceeds',
  'loan_interest',
  'loan_principal',
]);
const OBJECTIVE_IDS = new Set<string>(OBJECTIVES.map((o) => o.id));

class Validator {
  readonly errors: string[] = [];

  obj(value: unknown, path: string): Obj | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Obj;
    this.errors.push(`${path}: mesti objek`);
    return null;
  }

  arr(value: unknown, path: string): unknown[] | null {
    if (Array.isArray(value)) return value;
    this.errors.push(`${path}: mesti senarai`);
    return null;
  }

  int(value: unknown, path: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): void {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
      this.errors.push(`${path}: mesti integer antara ${min} dan ${max}`);
    }
  }

  num(value: unknown, path: string, min: number, max: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      this.errors.push(`${path}: mesti nombor antara ${min} dan ${max}`);
    }
  }

  str(value: unknown, path: string, maxLength = 200): void {
    if (typeof value !== 'string' || value.length > maxLength) this.errors.push(`${path}: mesti teks`);
  }

  bool(value: unknown, path: string): void {
    if (typeof value !== 'boolean') this.errors.push(`${path}: mesti boolean`);
  }

  oneOf(value: unknown, allowed: Iterable<string>, path: string): void {
    const set = new Set(allowed);
    if (typeof value !== 'string' || !set.has(value)) this.errors.push(`${path}: nilai tidak sah`);
  }

  check(condition: boolean, message: string): void {
    if (!condition) this.errors.push(message);
  }
}

function validateTransaction(v: Validator, value: unknown, path: string): void {
  const tx = v.obj(value, path);
  if (!tx) return;
  v.str(tx.id, `${path}.id`);
  v.int(tx.day, `${path}.day`, 1);
  v.oneOf(tx.type, TX_TYPES, `${path}.type`);
  v.int(tx.amountSen, `${path}.amountSen`);
  v.str(tx.label, `${path}.label`);
  if (tx.productId !== undefined) v.oneOf(tx.productId, PRODUCT_IDS, `${path}.productId`);
  if (tx.quantity !== undefined) v.int(tx.quantity, `${path}.quantity`, 0);
}

function validateGoal(v: Validator, value: unknown, path: string): Obj | null {
  const goal = v.obj(value, path);
  if (!goal) return null;
  v.oneOf(goal.kind, ['weekend', 'holiday'], `${path}.kind`);
  v.int(goal.targetSen, `${path}.targetSen`, GOAL_MIN_TARGET_SEN);
  v.int(goal.baseSen, `${path}.baseSen`, 0);
  v.int(goal.baseDays, `${path}.baseDays`, GOAL_MIN_BASE_DAYS, GOAL_BASE_DAYS);
  return goal;
}

function validateReport(v: Validator, value: unknown, path: string): void {
  const r = v.obj(value, path);
  if (!r) return;
  v.int(r.day, `${path}.day`, 1);
  v.str(r.cafeName, `${path}.cafeName`, CAFE_NAME_MAX_LENGTH);
  if (r.eventId !== null) v.oneOf(r.eventId, Object.keys(EVENTS), `${path}.eventId`);
  if (r.eventOutcome !== null) v.str(r.eventOutcome, `${path}.eventOutcome`, 1000);
  v.oneOf(r.promotionId, Object.keys(PROMOTIONS), `${path}.promotionId`);
  v.bool(r.promotionSkipped, `${path}.promotionSkipped`);
  for (const key of [
    'revenueSen',
    'otherIncomeSen',
    'cogsSen',
    'grossProfitSen',
    'totalExpensesSen',
    'netProfitSen',
    'openingCashSen',
    'closingCashSen',
    'stockPurchasesSen',
    'capexSen',
    'openingInventorySen',
    'closingInventorySen',
  ]) {
    v.int(r[key], `${path}.${key}`);
  }
  for (const key of ['loanProceedsSen', 'loanPrincipalRepaidSen', 'openingDebtSen', 'closingDebtSen']) {
    v.int(r[key], `${path}.${key}`, 0);
  }
  v.num(r.reputationBefore, `${path}.reputationBefore`, 0, 100);
  v.num(r.reputationAfter, `${path}.reputationAfter`, 0, 100);
  const exp = v.obj(r.expenses, `${path}.expenses`);
  if (exp) {
    for (const key of ['wagesSen', 'rentSen', 'utilitiesSen', 'marketingSen', 'otherSen', 'hiringSen', 'eventCostSen', 'spoilageSen', 'interestSen']) {
      v.int(exp[key], `${path}.expenses.${key}`, 0);
    }
  }
  const c = v.obj(r.customers, `${path}.customers`);
  if (c) {
    for (const key of ['arrivals', 'served', 'lostCapacity', 'lostStock', 'lostPrice', 'lostClosed']) {
      v.int(c[key], `${path}.customers.${key}`, 0);
    }
    v.num(c.serviceRate, `${path}.customers.serviceRate`, 0, 1);
  }
  const lines = v.arr(r.products, `${path}.products`);
  lines?.forEach((l, i) => {
    const line = v.obj(l, `${path}.products[${i}]`);
    if (!line) return;
    v.oneOf(line.productId, PRODUCT_IDS, `${path}.products[${i}].productId`);
    for (const key of ['demanded', 'sold', 'unmetStockout', 'revenueSen', 'cogsSen', 'spoiledUnits', 'spoiledValueSen', 'closingStock', 'salePriceSen']) {
      v.int(line[key], `${path}.products[${i}].${key}`, 0);
    }
  });
  const hourly = v.arr(r.hourly, `${path}.hourly`);
  hourly?.forEach((h, i) => {
    const line = v.obj(h, `${path}.hourly[${i}]`);
    if (!line) return;
    for (const key of ['hour', 'arrivals', 'served', 'lostCapacity', 'lostStock', 'lostPrice', 'lostClosed', 'capacity', 'revenueSen']) {
      v.int(line[key], `${path}.hourly[${i}].${key}`, 0);
    }
  });
  const timeline = v.arr(r.timeline, `${path}.timeline`);
  timeline?.forEach((t, i) => {
    const entry = v.obj(t, `${path}.timeline[${i}]`);
    if (!entry) return;
    v.int(entry.hour, `${path}.timeline[${i}].hour`, 0, 24);
    v.oneOf(entry.tone, ['neutral', 'good', 'warn', 'bad'], `${path}.timeline[${i}].tone`);
    v.str(entry.text, `${path}.timeline[${i}].text`, 1000);
  });
  v.arr(r.transactions, `${path}.transactions`)?.forEach((t, i) => validateTransaction(v, t, `${path}.transactions[${i}]`));
  v.arr(r.objectivesCompleted, `${path}.objectivesCompleted`)?.forEach((o, i) =>
    v.oneOf(o, OBJECTIVE_IDS, `${path}.objectivesCompleted[${i}]`),
  );
  if (r.goal !== null) {
    const goal = validateGoal(v, r.goal, `${path}.goal`);
    if (goal) {
      v.bool(goal.achieved, `${path}.goal.achieved`);
      if (typeof r.revenueSen === 'number' && typeof goal.targetSen === 'number') {
        v.check(goal.achieved === r.revenueSen >= goal.targetSen, `${path}.goal.achieved: tidak sepadan dengan hasil jualan`);
      }
    }
  }
}

/**
 * The loan must be internally consistent, so every later close keeps producing a valid save.
 * Its terms are not compared with today's offers: a loan keeps the terms it was taken on.
 */
function validateLoan(v: Validator, value: unknown, s: Obj): void {
  const day = s.day;
  const loan = v.obj(value, 'game.loan');
  if (!loan) return;
  v.oneOf(loan.offerId, Object.keys(LOAN_OFFERS), 'game.loan.offerId');
  v.int(loan.principalSen, 'game.loan.principalSen', 1, 100_000_000);
  v.int(loan.totalInterestSen, 'game.loan.totalInterestSen', 0, 100_000_000);
  v.int(loan.termDays, 'game.loan.termDays', 1, 365);
  v.int(loan.takenDay, 'game.loan.takenDay', 1, typeof day === 'number' ? day : 100_000);
  // An active loan always has at least one installment and some principal left to pay.
  const term = typeof loan.termDays === 'number' ? loan.termDays : 1;
  v.int(loan.paymentsMade, 'game.loan.paymentsMade', 0, term - 1);
  v.int(loan.principalRepaidSen, 'game.loan.principalRepaidSen', 0, typeof loan.principalSen === 'number' ? loan.principalSen - 1 : 0);
  v.int(loan.interestPaidSen, 'game.loan.interestPaidSen', 0, typeof loan.totalInterestSen === 'number' ? loan.totalInterestSen : 0);
  const errorsBefore = v.errors.length;
  for (const key of ['principalSen', 'totalInterestSen', 'termDays', 'takenDay', 'paymentsMade', 'principalRepaidSen', 'interestPaidSen']) {
    v.int(loan[key], `game.loan.${key}`);
  }
  if (v.errors.length > errorsBefore || typeof s.lastSettledDay !== 'number') return;

  const l = loan as unknown as Pick<
    ActiveLoan,
    'principalSen' | 'totalInterestSen' | 'termDays' | 'takenDay' | 'paymentsMade' | 'principalRepaidSen' | 'interestPaidSen'
  >;
  // One installment at every close after the day the loan was taken.
  v.check(l.paymentsMade === Math.max(0, s.lastSettledDay - l.takenDay), 'game.loan.paymentsMade: tidak sepadan dengan hari yang ditutup');
  // Before the last installment, every installment is the same size.
  const first = installment(l, 1);
  v.check(l.principalRepaidSen === first.principalSen * l.paymentsMade, 'game.loan.principalRepaidSen: tidak sepadan dengan ansuran');
  v.check(l.interestPaidSen === first.interestSen * l.paymentsMade, 'game.loan.interestPaidSen: tidak sepadan dengan ansuran');
  // In preparation, a loan taken on an earlier day is still exactly the debt the day started with.
  const dayStart = s.dayStart as Obj | undefined;
  if (s.phase === 'prep' && typeof day === 'number' && l.takenDay < day && dayStart) {
    v.check(dayStart.debtSen === remainingPrincipal(l as ActiveLoan), 'game.dayStart.debtSen: tidak sepadan dengan baki pinjaman');
  }
}

export type ValidationResult = { ok: true; state: GameState } | { ok: false; errors: string[] };

export function validateGameState(value: unknown): ValidationResult {
  const v = new Validator();
  const s = v.obj(value, 'game');
  if (!s) return { ok: false, errors: v.errors };

  v.check(s.schemaVersion === SAVE_SCHEMA_VERSION, `game.schemaVersion: dijangka ${SAVE_SCHEMA_VERSION}`);
  v.int(s.seed, 'game.seed', 0, 0xffffffff);
  v.str(s.cafeName, 'game.cafeName', CAFE_NAME_MAX_LENGTH);
  v.check(typeof s.cafeName === 'string' && s.cafeName.trim().length > 0, 'game.cafeName: kosong');
  v.int(s.day, 'game.day', 1, 100_000);
  v.oneOf(s.phase, ['prep', 'closed'], 'game.phase');
  v.oneOf(s.status, ['active', 'bankrupt'], 'game.status');
  v.int(s.cashSen, 'game.cashSen');
  v.num(s.reputation, 'game.reputation', 0, 100);

  const products = v.obj(s.products, 'game.products');
  if (products) {
    for (const id of PRODUCT_IDS) {
      const p = v.obj(products[id], `game.products.${id}`);
      if (!p) continue;
      v.check(p.id === id, `game.products.${id}.id: tidak sepadan`);
      v.int(p.priceSen, `game.products.${id}.priceSen`, MIN_PRICE_SEN, MAX_PRICE_SEN);
      v.int(p.unitCostSen, `game.products.${id}.unitCostSen`, 0, MAX_PRICE_SEN);
      v.int(p.stock, `game.products.${id}.stock`, 0, MAX_STOCK_PER_PRODUCT);
      v.int(p.stockValueSen, `game.products.${id}.stockValueSen`, 0);
      v.bool(p.enabled, `game.products.${id}.enabled`);
      v.check(p.stock !== 0 || p.stockValueSen === 0, `game.products.${id}: nilai stok tanpa unit`);
    }
  }

  const staff = v.arr(s.staff, 'game.staff');
  if (staff) {
    v.check(staff.length >= 1, 'game.staff: sekurang-kurangnya seorang staf');
    let baristas = 0;
    staff.forEach((m, i) => {
      const member = v.obj(m, `game.staff[${i}]`);
      if (!member) return;
      v.str(member.id, `game.staff[${i}].id`);
      v.str(member.name, `game.staff[${i}].name`, 60);
      v.oneOf(member.role, ['barista', 'cashier'], `game.staff[${i}].role`);
      v.int(member.wageSen, `game.staff[${i}].wageSen`, 0);
      v.int(member.ordersPerHour, `game.staff[${i}].ordersPerHour`, 1, 50);
      v.int(member.hiredDay, `game.staff[${i}].hiredDay`, 1);
      if (member.role === 'barista') baristas += 1;
    });
    v.check(baristas >= 1, 'game.staff: tiada barista');
  }

  const upgrades = v.arr(s.upgrades, 'game.upgrades');
  upgrades?.forEach((u, i) => v.oneOf(u, Object.keys(UPGRADES), `game.upgrades[${i}]`));
  if (upgrades) v.check(new Set(upgrades).size === upgrades.length, 'game.upgrades: pendua');

  v.oneOf(s.promotion, Object.keys(PROMOTIONS), 'game.promotion');
  if (s.todayEventId !== null) v.oneOf(s.todayEventId, Object.keys(EVENTS), 'game.todayEventId');
  if (s.goal !== null) {
    const goal = validateGoal(v, s.goal, 'game.goal');
    if (goal && typeof s.day === 'number') {
      const eventId = typeof s.todayEventId === 'string' ? (s.todayEventId as EventId) : null;
      v.check(goal.kind === goalKindFor(s.day, eventId), 'game.goal.kind: tidak sepadan dengan hari ini');
    }
  }

  const dayStart = v.obj(s.dayStart, 'game.dayStart');
  if (dayStart) {
    v.int(dayStart.cashSen, 'game.dayStart.cashSen');
    v.int(dayStart.inventorySen, 'game.dayStart.inventorySen', 0);
    v.int(dayStart.debtSen, 'game.dayStart.debtSen', 0);
    if (dayStart.staffNames !== undefined) {
      const names = v.arr(dayStart.staffNames, 'game.dayStart.staffNames');
      if (names) {
        v.check(names.length <= 64, 'game.dayStart.staffNames: terlalu banyak');
        names.forEach((n, i) => v.str(n, `game.dayStart.staffNames[${i}]`, 60));
      }
    }
    if (dayStart.cafeName !== undefined) v.str(dayStart.cafeName, 'game.dayStart.cafeName', CAFE_NAME_MAX_LENGTH);
    if (dayStart.priceSen !== undefined) {
      const prices = v.obj(dayStart.priceSen, 'game.dayStart.priceSen');
      if (prices) for (const id of PRODUCT_IDS) v.int(prices[id], `game.dayStart.priceSen.${id}`, MIN_PRICE_SEN, MAX_PRICE_SEN);
    }
  }

  v.arr(s.dayTransactions, 'game.dayTransactions')?.forEach((t, i) => validateTransaction(v, t, `game.dayTransactions[${i}]`));
  v.int(s.txSeq, 'game.txSeq', 1);
  v.int(s.lastSettledDay, 'game.lastSettledDay', 0);
  if (typeof s.day === 'number' && typeof s.lastSettledDay === 'number') {
    const expected = s.phase === 'closed' ? s.day : s.day - 1;
    v.check(s.lastSettledDay === expected, 'game.lastSettledDay: tidak konsisten dengan fasa hari');
  }

  v.arr(s.history, 'game.history')?.forEach((r, i) => validateReport(v, r, `game.history[${i}]`));

  v.arr(s.completedObjectives, 'game.completedObjectives')?.forEach((o, i) => {
    const entry = v.obj(o, `game.completedObjectives[${i}]`);
    if (!entry) return;
    v.oneOf(entry.id, OBJECTIVE_IDS, `game.completedObjectives[${i}].id`);
    v.int(entry.day, `game.completedObjectives[${i}].day`, 1);
  });

  const stats = v.obj(s.stats, 'game.stats');
  if (stats) {
    for (const key of [
      'daysCompleted',
      'totalServed',
      'bestDayRevenueSen',
      'profitableDays',
      'profitStreak',
      'perfectServiceDays',
      'negativeCashStreak',
      'loansRepaid',
      'goalsMet',
      'holidayGoalsMet',
      'perfectWeekends',
    ]) {
      v.int(stats[key], `game.stats.${key}`, 0);
    }
    v.int(stats.totalRevenueSen, 'game.stats.totalRevenueSen', 0);
    v.int(stats.totalNetProfitSen, 'game.stats.totalNetProfitSen');
  }

  if (s.loan !== null) validateLoan(v, s.loan, s);

  if (v.errors.length > 0) return { ok: false, errors: v.errors };
  return { ok: true, state: value as GameState };
}
