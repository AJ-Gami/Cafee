/**
 * Typed game model for REAL LIFE TYCOON: Café Empire.
 *
 * Money rule: every monetary field ends in `Sen` and holds an integer number of
 * sen (RM1.00 = 100 sen). Never store ringgit as a floating-point number.
 */

export type ProductId = 'kopi_o' | 'americano' | 'latte' | 'teh_ais' | 'croissant';

export const PRODUCT_IDS: readonly ProductId[] = ['kopi_o', 'americano', 'latte', 'teh_ais', 'croissant'];

export type StaffRole = 'barista' | 'cashier';

export type UpgradeId =
  | 'espresso_machine'
  | 'pastry_display'
  | 'signage'
  | 'hygiene_system'
  | 'cozy_interior'
  | 'pos_system'
  | 'air_cond'
  | 'second_counter'
  | 'supplier_contract';

export type PromotionId = 'none' | 'social' | 'flyers' | 'discount10' | 'influencer';

export type EventId =
  | 'heavy_rain'
  | 'heatwave'
  | 'food_festival'
  | 'public_holiday'
  | 'coffee_price_spike'
  | 'competitor_promo'
  | 'exam_season'
  | 'machine_breakdown'
  | 'food_blogger'
  | 'health_inspection'
  | 'office_order'
  | 'power_outage'
  | 'viral_post'
  | 'pipe_leak'
  | 'barista_contest';

export type ObjectiveId =
  | 'first_day'
  | 'first_profit'
  | 'serve_100'
  | 'no_stockout'
  | 'hire_staff'
  | 'first_upgrade'
  | 'revenue_600'
  | 'rep_70'
  | 'cash_8000'
  | 'profit_streak_5'
  | 'serve_1000'
  | 'revenue_1200'
  | 'rep_90'
  | 'cash_25000'
  | 'repay_loan';

/** prep = preparing before opening; closed = today has been settled and its report is ready. */
export type DayPhase = 'prep' | 'closed';

export type GameStatus = 'active' | 'bankrupt';

export interface ProductState {
  id: ProductId;
  /** Menu selling price per unit. */
  priceSen: number;
  /** Current supplier cost per unit (before event modifiers or bulk discounts). */
  unitCostSen: number;
  /** Units on hand. Never negative. */
  stock: number;
  /** Carrying value of the units on hand (weighted-average cost). 0 when stock is 0. */
  stockValueSen: number;
  /** Whether the product is offered on today's menu. */
  enabled: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  wageSen: number;
  /** Orders this person can complete per opening hour. */
  ordersPerHour: number;
  hiredDay: number;
}

export interface StaffCandidate extends StaffMember {
  hireFeeSen: number;
}

export type TransactionType =
  | 'stock_purchase'
  | 'sale'
  | 'wages'
  | 'rent'
  | 'utilities'
  | 'marketing'
  | 'event_cost'
  | 'event_income'
  | 'hiring'
  | 'upgrade'
  /** Cash received from a bank loan (financing, not revenue). */
  | 'loan_proceeds'
  /** Interest part of a loan installment (an expense). */
  | 'loan_interest'
  /** Principal part of a loan installment or an early repayment (financing, not an expense). */
  | 'loan_principal';

/** A cash movement. Positive = cash in, negative = cash out. */
export interface Transaction {
  id: string;
  day: number;
  type: TransactionType;
  amountSen: number;
  label: string;
  productId?: ProductId;
  quantity?: number;
}

export interface ProductDayLine {
  productId: ProductId;
  /** Units wanted by customers (including unmet demand). */
  demanded: number;
  sold: number;
  /** Units customers wanted but could not get because the item was out of stock. */
  unmetStockout: number;
  revenueSen: number;
  cogsSen: number;
  spoiledUnits: number;
  spoiledValueSen: number;
  closingStock: number;
  /** Effective sale price per unit today (after promotion discount). */
  salePriceSen: number;
}

export interface HourlyLine {
  hour: number;
  arrivals: number;
  served: number;
  lostCapacity: number;
  lostStock: number;
  lostPrice: number;
  lostClosed: number;
  capacity: number;
  revenueSen: number;
}

export type TimelineTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface TimelineEntry {
  hour: number;
  tone: TimelineTone;
  text: string;
}

export interface CustomerSummary {
  arrivals: number;
  served: number;
  lostCapacity: number;
  lostStock: number;
  lostPrice: number;
  lostClosed: number;
  /** served / customers willing to buy (excludes price walk-outs). 0..1 */
  serviceRate: number;
}

export interface ExpenseBreakdown {
  wagesSen: number;
  rentSen: number;
  utilitiesSen: number;
  marketingSen: number;
  /** Total of all "other" items below. */
  otherSen: number;
  hiringSen: number;
  eventCostSen: number;
  /** Non-cash write-off of spoiled stock at its carrying value. */
  spoilageSen: number;
  /** Interest paid on a bank loan. */
  interestSen: number;
}

export interface DayReport {
  day: number;
  cafeName: string;
  eventId: EventId | null;
  eventOutcome: string | null;
  promotionId: PromotionId;
  /** Set when the selected promotion could not run (insufficient cash). */
  promotionSkipped: boolean;

  revenueSen: number;
  otherIncomeSen: number;
  cogsSen: number;
  grossProfitSen: number;
  expenses: ExpenseBreakdown;
  totalExpensesSen: number;
  netProfitSen: number;

  openingCashSen: number;
  closingCashSen: number;
  stockPurchasesSen: number;
  capexSen: number;
  /** Bank loan money received today (financing inflow). */
  loanProceedsSen: number;
  /** Loan principal paid back today (financing outflow). */
  loanPrincipalRepaidSen: number;
  openingDebtSen: number;
  closingDebtSen: number;

  openingInventorySen: number;
  closingInventorySen: number;

  reputationBefore: number;
  reputationAfter: number;

  customers: CustomerSummary;
  products: ProductDayLine[];
  hourly: HourlyLine[];
  timeline: TimelineEntry[];
  transactions: Transaction[];
  objectivesCompleted: ObjectiveId[];
}

export interface GameStats {
  daysCompleted: number;
  totalServed: number;
  totalRevenueSen: number;
  totalNetProfitSen: number;
  bestDayRevenueSen: number;
  profitableDays: number;
  profitStreak: number;
  perfectServiceDays: number;
  negativeCashStreak: number;
  /** Bank loans paid off in full. */
  loansRepaid: number;
}

export interface CompletedObjective {
  id: ObjectiveId;
  day: number;
}

export interface DayStartSnapshot {
  cashSen: number;
  inventorySen: number;
  /** Loan principal still owed when the day started. */
  debtSen: number;
  /**
   * Names of the team when the day started. They are reserved for the whole day so hiring or
   * firing during preparation never renames today's candidates. Absent in older saves.
   */
  staffNames?: string[];
}

export interface GameState {
  schemaVersion: number;
  /** Master seed. All randomness derives from (seed, day, purpose) so a day can never be re-rolled. */
  seed: number;
  cafeName: string;
  day: number;
  phase: DayPhase;
  status: GameStatus;
  cashSen: number;
  /** 0..100, one decimal place. */
  reputation: number;
  products: Record<ProductId, ProductState>;
  staff: StaffMember[];
  upgrades: UpgradeId[];
  promotion: PromotionId;
  todayEventId: EventId | null;
  dayStart: DayStartSnapshot;
  /** Cash movements recorded during today's preparation (purchases, hiring, upgrades). */
  dayTransactions: Transaction[];
  txSeq: number;
  /** Highest day number that has been settled. Guards against double settlement. */
  lastSettledDay: number;
  history: DayReport[];
  completedObjectives: CompletedObjective[];
  stats: GameStats;
  /** The café's bank loan, if one is being repaid. At most one at a time. */
  loan: ActiveLoan | null;
}

export type LoanOfferId = 'mikro' | 'perniagaan' | 'pengembangan';

export interface ActiveLoan {
  offerId: LoanOfferId;
  principalSen: number;
  /** Flat interest for the whole term, fixed when the loan is taken. */
  totalInterestSen: number;
  termDays: number;
  takenDay: number;
  /** Installments already paid (each at a day's close, starting the day after the loan is taken). */
  paymentsMade: number;
  principalRepaidSen: number;
  interestPaidSen: number;
}

export type EngineErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'UNKNOWN_ITEM'
  | 'WRONG_PHASE'
  | 'ALREADY_SETTLED'
  | 'STALE_DAY'
  | 'STAFF_LIMIT'
  | 'LAST_BARISTA'
  | 'ALREADY_OWNED'
  | 'LOCKED'
  | 'STORAGE_FULL'
  | 'GAME_OVER'
  | 'NO_CHANGE'
  | 'LOAN_ACTIVE'
  | 'NO_LOAN';

export type EngineResult =
  | { ok: true; state: GameState; message: string; report?: DayReport; newObjectives?: ObjectiveId[] }
  | { ok: false; error: EngineErrorCode; message: string };
