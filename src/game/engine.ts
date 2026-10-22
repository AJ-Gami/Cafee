/**
 * Game engine: every player action is a pure function (state, input) -> result.
 * React never computes financial results itself; it only renders engine output.
 */
import {
  BANKRUPTCY_NEGATIVE_DAYS,
  CAFE_NAME_MAX_LENGTH,
  DEFAULT_CAFE_NAME,
  HISTORY_LIMIT,
  MAX_PRICE_SEN,
  MAX_PURCHASE_QTY,
  MAX_STOCK_PER_PRODUCT,
  MIN_PRICE_SEN,
  SAVE_SCHEMA_VERSION,
  STARTING_CASH_SEN,
  STARTING_REPUTATION,
} from './constants';
import { PRODUCTS } from './data/products';
import { PROMOTIONS } from './data/promotions';
import { STAFF_ROLES, STARTING_STAFF } from './data/staff';
import { UPGRADES } from './data/upgrades';
import { buildModifiers, capacityForHour, formatHour, percentPoints, reputationChange, simulateDay, weekdayName } from './demand';
import {
  addToStock,
  canAfford,
  dailyRent,
  dailyUtilities,
  inventoryValue,
  quotePurchase,
  takeFromStock,
} from './economy';
import { resolveEvent, rollEventForDay, type ResolvedEvent } from './events';
import { dayGoalFor, GOAL_TITLE, goalResult, isSunday } from './goals';
import { applyBps, formatRM, sumSen } from './money';
import { LOAN_OFFERS } from './data/loans';
import { afterInstallment, installmentDue, newLoan, remainingPrincipal, settlementQuote } from './loans';
import { currentLevel, evaluateObjectives } from './objectives';
import { dayRng, RNG_PURPOSE } from './rng';
import { baristaCount, candidatesForState, hourlyCapacity, staffSlots } from './staff';
import type {
  CustomerSummary,
  DayReport,
  EngineErrorCode,
  EngineResult,
  ExpenseBreakdown,
  GameState,
  ProductDayLine,
  ProductId,
  ProductState,
  PromotionId,
  TimelineEntry,
  Transaction,
  TransactionType,
  LoanOfferId,
  UpgradeId,
} from './types';
import { PRODUCT_IDS } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(error: EngineErrorCode, message: string): EngineResult {
  return { ok: false, error, message };
}

function succeed(state: GameState, message: string, extra: { report?: DayReport } = {}): EngineResult {
  const evaluated = evaluateObjectives(state);
  return { ok: true, state: evaluated.state, message, newObjectives: evaluated.newlyCompleted, ...extra };
}

function guardPrep(state: GameState): EngineResult | null {
  if (state.status !== 'active') return fail('GAME_OVER', 'Permainan telah tamat. Mulakan permainan baharu.');
  if (state.phase !== 'prep') {
    return fail('WRONG_PHASE', 'Kafe sudah ditutup untuk hari ini. Mulakan hari seterusnya untuk membuat persediaan.');
  }
  return null;
}

function isProductId(value: unknown): value is ProductId {
  return typeof value === 'string' && (PRODUCT_IDS as readonly string[]).includes(value);
}

function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === 'string' && value in UPGRADES;
}

function isPromotionId(value: unknown): value is PromotionId {
  return typeof value === 'string' && value in PROMOTIONS;
}

function makeTx(
  state: GameState,
  seq: number,
  type: TransactionType,
  amountSen: number,
  label: string,
  extra: Pick<Transaction, 'productId' | 'quantity'> = {},
): Transaction {
  return { id: `tx-${state.day}-${seq}`, day: state.day, type, amountSen, label, ...extra };
}

function withTransaction(
  state: GameState,
  type: TransactionType,
  amountSen: number,
  label: string,
  extra: Pick<Transaction, 'productId' | 'quantity'> = {},
): GameState {
  const tx = makeTx(state, state.txSeq, type, amountSen, label, extra);
  return {
    ...state,
    cashSen: state.cashSen + amountSen,
    txSeq: state.txSeq + 1,
    dayTransactions: [...state.dayTransactions, tx],
  };
}

function insufficient(neededSen: number, cashSen: number): EngineResult {
  return fail(
    'INSUFFICIENT_FUNDS',
    `Tunai tidak mencukupi. Perlu ${formatRM(neededSen)}, baki tunai ${formatRM(cashSen)}.`,
  );
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export function createInitialProducts(): Record<ProductId, ProductState> {
  return Object.fromEntries(
    PRODUCT_IDS.map((id) => {
      const def = PRODUCTS[id];
      const product: ProductState = {
        id,
        priceSen: def.defaultPriceSen,
        unitCostSen: def.baseCostSen,
        stock: 0,
        stockValueSen: 0,
        enabled: true,
      };
      return [id, product];
    }),
  ) as Record<ProductId, ProductState>;
}

function menuPrices(products: Record<ProductId, ProductState>): Record<ProductId, number> {
  return Object.fromEntries(PRODUCT_IDS.map((id) => [id, products[id].priceSen])) as Record<ProductId, number>;
}

export function createNewGame(seed: number, cafeName: string = DEFAULT_CAFE_NAME): GameState {
  const products = createInitialProducts();
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    seed: seed >>> 0,
    cafeName: sanitizeCafeName(cafeName) ?? DEFAULT_CAFE_NAME,
    day: 1,
    phase: 'prep',
    status: 'active',
    cashSen: STARTING_CASH_SEN,
    reputation: STARTING_REPUTATION,
    products,
    staff: [{ ...STARTING_STAFF }],
    upgrades: [],
    promotion: 'none',
    todayEventId: rollEventForDay(seed >>> 0, 1),
    dayStart: {
      cashSen: STARTING_CASH_SEN,
      inventorySen: inventoryValue(products),
      debtSen: 0,
      staffNames: [STARTING_STAFF.name],
      cafeName: sanitizeCafeName(cafeName) ?? DEFAULT_CAFE_NAME,
      priceSen: menuPrices(products),
    },
    dayTransactions: [],
    txSeq: 1,
    lastSettledDay: 0,
    history: [],
    completedObjectives: [],
    stats: {
      daysCompleted: 0,
      totalServed: 0,
      totalRevenueSen: 0,
      totalNetProfitSen: 0,
      bestDayRevenueSen: 0,
      profitableDays: 0,
      profitStreak: 0,
      perfectServiceDays: 0,
      negativeCashStreak: 0,
      loansRepaid: 0,
      goalsMet: 0,
      holidayGoalsMet: 0,
      perfectWeekends: 0,
    },
    loan: null,
    // Day 1 is a Monday with no earlier days to set a goal from.
    goal: null,
  };
}

export function sanitizeCafeName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0 || trimmed.length > CAFE_NAME_MAX_LENGTH) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Preparation actions
// ---------------------------------------------------------------------------

export function purchaseStock(state: GameState, productId: ProductId, quantity: number): EngineResult {
  return purchaseStockBatch(state, [{ productId, quantity }]);
}

/** Buy several products atomically: either every line succeeds or nothing changes. */
export function purchaseStockBatch(
  state: GameState,
  items: readonly { productId: ProductId; quantity: number }[],
): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  const lines = items.filter((i) => i.quantity !== 0);
  if (lines.length === 0) return fail('INVALID_QUANTITY', 'Tiada kuantiti untuk dibeli.');

  for (const item of lines) {
    if (!isProductId(item.productId)) return fail('UNKNOWN_ITEM', 'Produk tidak dikenali.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_PURCHASE_QTY) {
      return fail('INVALID_QUANTITY', `Kuantiti mesti antara 1 dan ${MAX_PURCHASE_QTY}.`);
    }
    const product = state.products[item.productId];
    if (product.stock + item.quantity > MAX_STOCK_PER_PRODUCT) {
      return fail(
        'STORAGE_FULL',
        `Stor penuh. ${PRODUCTS[item.productId].name} boleh disimpan maksimum ${MAX_STOCK_PER_PRODUCT} unit.`,
      );
    }
  }

  const quotes = lines.map((i) => quotePurchase(state, i.productId, i.quantity));
  const total = sumSen(quotes.map((q) => q.totalSen));
  if (total > state.cashSen) return insufficient(total, state.cashSen);

  let next = state;
  for (const quote of quotes) {
    const def = PRODUCTS[quote.productId];
    next = {
      ...next,
      products: {
        ...next.products,
        [quote.productId]: addToStock(next.products[quote.productId], quote.quantity, quote.totalSen),
      },
    };
    next = withTransaction(next, 'stock_purchase', -quote.totalSen, `Beli stok ${def.name} ×${quote.quantity}`, {
      productId: quote.productId,
      quantity: quote.quantity,
    });
  }

  const message =
    quotes.length === 1 && quotes[0]
      ? `Berjaya membeli ${quotes[0].quantity} ${PRODUCTS[quotes[0].productId].unitLabel} ${PRODUCTS[quotes[0].productId].name} (${formatRM(total)}).`
      : `Berjaya membeli stok untuk ${quotes.length} produk (${formatRM(total)}).`;
  return succeed(next, message);
}

export function setPrice(state: GameState, productId: ProductId, priceSen: number): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!isProductId(productId)) return fail('UNKNOWN_ITEM', 'Produk tidak dikenali.');
  if (!Number.isInteger(priceSen) || priceSen < MIN_PRICE_SEN || priceSen > MAX_PRICE_SEN) {
    return fail('INVALID_PRICE', `Harga mesti antara ${formatRM(MIN_PRICE_SEN)} dan ${formatRM(MAX_PRICE_SEN)}.`);
  }
  const product = state.products[productId];
  if (product.priceSen === priceSen) return fail('NO_CHANGE', 'Harga tidak berubah.');
  return succeed(
    { ...state, products: { ...state.products, [productId]: { ...product, priceSen } } },
    `Harga ${PRODUCTS[productId].name} kini ${formatRM(priceSen)}.`,
  );
}

export function setProductEnabled(state: GameState, productId: ProductId, enabled: boolean): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!isProductId(productId)) return fail('UNKNOWN_ITEM', 'Produk tidak dikenali.');
  const product = state.products[productId];
  if (product.enabled === enabled) return fail('NO_CHANGE', 'Tiada perubahan.');
  return succeed(
    { ...state, products: { ...state.products, [productId]: { ...product, enabled } } },
    `${PRODUCTS[productId].name} ${enabled ? 'dimasukkan ke dalam' : 'dikeluarkan daripada'} menu hari ini.`,
  );
}

export function setPromotion(state: GameState, promotionId: PromotionId): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!isPromotionId(promotionId)) return fail('UNKNOWN_ITEM', 'Promosi tidak dikenali.');
  const def = PROMOTIONS[promotionId];
  if (currentLevel(state) < def.minLevel) return fail('LOCKED', `Promosi ini dibuka pada Tahap ${def.minLevel}.`);
  if (!canAfford(def.costSen, state.cashSen)) return insufficient(def.costSen, state.cashSen);
  if (state.promotion === promotionId) return fail('NO_CHANGE', 'Promosi ini sudah dipilih.');
  const message =
    promotionId === 'none'
      ? 'Tiada promosi untuk hari ini.'
      : `Promosi dipilih: ${def.name}${def.costSen > 0 ? ` (${formatRM(def.costSen)} dibayar semasa kafe dibuka)` : ''}.`;
  return succeed({ ...state, promotion: promotionId }, message);
}

/** Label of the hiring transaction; names the person (save comparisons match hires by it). */
export function hiringLabel(name: string): string {
  return `Kos pengambilan ${name}`;
}

/** Start of a wage transaction's label for a team member. */
export function wagesLabelPrefix(name: string): string {
  return `Gaji ${name} (`;
}

export function hireStaff(state: GameState, candidateId: string): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  const candidate = candidatesForState(state).find((c) => c.id === candidateId);
  if (!candidate) return fail('UNKNOWN_ITEM', 'Calon ini tidak lagi tersedia.');
  const slots = staffSlots(state.upgrades);
  if (state.staff.length >= slots) {
    return fail('STAFF_LIMIT', `Had staf ${slots} orang telah dicapai. Naik taraf kaunter untuk menambah ruang.`);
  }
  if (candidate.hireFeeSen > state.cashSen) return insufficient(candidate.hireFeeSen, state.cashSen);
  const { hireFeeSen, ...member } = candidate;
  let next: GameState = { ...state, staff: [...state.staff, member] };
  next = withTransaction(next, 'hiring', -hireFeeSen, hiringLabel(member.name));
  return succeed(
    next,
    `${member.name} kini sebahagian pasukan sebagai ${STAFF_ROLES[member.role].name}. Gaji ${formatRM(member.wageSen)} sehari.`,
  );
}

export function fireStaff(state: GameState, staffId: string): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  const member = state.staff.find((s) => s.id === staffId);
  if (!member) return fail('UNKNOWN_ITEM', 'Staf tidak dijumpai.');
  if (member.role === 'barista' && baristaCount(state.staff) <= 1) {
    return fail('LAST_BARISTA', 'Kafe memerlukan sekurang-kurangnya seorang barista.');
  }
  return succeed(
    { ...state, staff: state.staff.filter((s) => s.id !== staffId) },
    `${member.name} telah diberhentikan.`,
  );
}

export function buyUpgrade(state: GameState, upgradeId: UpgradeId): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!isUpgradeId(upgradeId)) return fail('UNKNOWN_ITEM', 'Naik taraf tidak dikenali.');
  const def = UPGRADES[upgradeId];
  if (state.upgrades.includes(upgradeId)) return fail('ALREADY_OWNED', 'Anda sudah memiliki naik taraf ini.');
  if (currentLevel(state) < def.minLevel) return fail('LOCKED', `Naik taraf ini dibuka pada Tahap ${def.minLevel}.`);
  if (def.costSen > state.cashSen) return insufficient(def.costSen, state.cashSen);

  let products = state.products;
  const discount = def.effects.supplierDiscountBps ?? 0;
  if (discount > 0) {
    products = { ...products };
    for (const id of PRODUCT_IDS) {
      const p = products[id];
      products[id] = { ...p, unitCostSen: p.unitCostSen - applyBps(p.unitCostSen, discount) };
    }
  }
  let next: GameState = { ...state, products, upgrades: [...state.upgrades, upgradeId] };
  next = withTransaction(next, 'upgrade', -def.costSen, `Naik taraf: ${def.name}`);
  return succeed(next, `${def.name} dipasang!`);
}

function isLoanOfferId(value: unknown): value is LoanOfferId {
  return typeof value === 'string' && value in LOAN_OFFERS;
}

/** Borrow from the bank. Installments start at the close of the next day. */
export function takeLoan(state: GameState, offerId: LoanOfferId): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!isLoanOfferId(offerId)) return fail('UNKNOWN_ITEM', 'Tawaran pinjaman tidak dikenali.');
  if (state.loan) return fail('LOAN_ACTIVE', 'Lunaskan pinjaman semasa sebelum mengambil pinjaman baharu.');
  const def = LOAN_OFFERS[offerId];
  if (currentLevel(state) < def.minLevel) return fail('LOCKED', `Pinjaman ini dibuka pada Tahap ${def.minLevel}.`);
  let next: GameState = { ...state, loan: newLoan(offerId, state.day) };
  next = withTransaction(next, 'loan_proceeds', def.principalSen, `Pinjaman diterima: ${def.name}`);
  return succeed(next, `${def.name} sebanyak ${formatRM(def.principalSen)} diterima. Bayaran harian bermula esok.`);
}

/**
 * Pay off the remaining principal now, plus the interest for the day already traded on the loan.
 * Later installments are waived. Repaying on the day the loan was taken simply cancels it.
 */
export function repayLoan(state: GameState): EngineResult {
  const blocked = guardPrep(state);
  if (blocked) return blocked;
  if (!state.loan) return fail('NO_LOAN', 'Tiada pinjaman untuk dibayar.');
  const quote = settlementQuote(state.loan, state.day);
  if (quote.totalSen > state.cashSen) return insufficient(quote.totalSen, state.cashSen);
  const def = LOAN_OFFERS[state.loan.offerId];
  let next: GameState = {
    ...state,
    loan: null,
    stats: { ...state.stats, loansRepaid: state.stats.loansRepaid + (quote.cancellation ? 0 : 1) },
  };
  if (quote.cancellation) {
    next = withTransaction(next, 'loan_principal', -quote.principalSen, `Pinjaman dibatalkan: ${def.name}`);
    return succeed(next, `${def.name} dibatalkan dan ${formatRM(quote.principalSen)} dipulangkan kepada bank.`);
  }
  if (quote.interestSen > 0) next = withTransaction(next, 'loan_interest', -quote.interestSen, `Faedah penyelesaian awal: ${def.name}`);
  next = withTransaction(next, 'loan_principal', -quote.principalSen, `Penyelesaian awal: ${def.name}`);
  return succeed(next, `${def.name} dilunaskan (${formatRM(quote.totalSen)}). Tiada faedah lagi dikenakan.`);
}

export function renameCafe(state: GameState, name: string): EngineResult {
  const clean = sanitizeCafeName(name);
  if (!clean) return fail('INVALID_QUANTITY', `Nama kafe mesti 1–${CAFE_NAME_MAX_LENGTH} aksara.`);
  if (clean === state.cafeName) return fail('NO_CHANGE', 'Nama tidak berubah.');
  return { ok: true, state: { ...state, cafeName: clean }, message: `Kafe dinamakan semula kepada "${clean}".` };
}

// ---------------------------------------------------------------------------
// Daily settlement
// ---------------------------------------------------------------------------

function spoilageRate(productId: ProductId, upgrades: readonly UpgradeId[]): number {
  let rate = PRODUCTS[productId].spoilageRate;
  for (const id of upgrades) rate *= UPGRADES[id].effects.spoilageMultiplier?.[productId] ?? 1;
  return rate;
}

function describeEvent(
  event: ResolvedEvent,
  customers: CustomerSummary,
  reviewerDelta: number,
  extraOrder: { requested: number; fulfilled: number } | null,
): string {
  const parts: string[] = [];
  if (event.mitigationNote) parts.push(event.mitigationNote);
  const effects = event.effects;
  if (effects.reviewer) {
    parts.push(
      reviewerDelta >= 0
        ? `Pengulas berpuas hati dengan servis anda (${percentPoints(customers.serviceRate)}% pelanggan dilayan).`
        : `Pengulas kecewa — hanya ${percentPoints(customers.serviceRate)}% pelanggan dilayan.`,
    );
  }
  if (extraOrder) {
    parts.push(
      extraOrder.fulfilled === extraOrder.requested
        ? `Tempahan dipenuhi sepenuhnya (${extraOrder.fulfilled}/${extraOrder.requested}).`
        : `Hanya ${extraOrder.fulfilled}/${extraOrder.requested} item dapat dipenuhi kerana stok tidak cukup.`,
    );
  }
  if (effects.cashSen && effects.cashSen < 0) parts.push(`Kos ${formatRM(-effects.cashSen)} direkodkan.`);
  if (effects.cashSen && effects.cashSen > 0) parts.push(`Pendapatan lain ${formatRM(effects.cashSen)} diterima.`);
  return parts.join(' ');
}

/**
 * Open the café for `day` and settle it. Runs at most once per day: the call
 * is rejected unless `day` matches the current day, the café is still in
 * preparation, and the day has not already been settled.
 */
export function openCafe(state: GameState, day: number): EngineResult {
  if (state.status !== 'active') return fail('GAME_OVER', 'Permainan telah tamat. Mulakan permainan baharu.');
  if (day !== state.day) return fail('STALE_DAY', 'Permintaan untuk hari yang salah diabaikan.');
  if (state.phase !== 'prep' || state.lastSettledDay >= day) {
    return fail('ALREADY_SETTLED', `Hari ${day} telah pun diproses.`);
  }

  const event = resolveEvent(state.todayEventId, state.upgrades);
  const chosenPromo = PROMOTIONS[state.promotion];
  const promotionSkipped = !canAfford(chosenPromo.costSen, state.cashSen);
  const promo = promotionSkipped ? PROMOTIONS.none : chosenPromo;
  const mods = buildModifiers(state.upgrades, promo, event);
  const baseHourlyCapacity = hourlyCapacity(state.staff, state.upgrades);

  const extra = event?.effects.extraOrders;
  const sim = simulateDay(
    {
      day,
      reputation: state.reputation,
      products: state.products,
      baseHourlyCapacity,
      mods,
      ...(extra ? { extraOrders: { hour: event.def.hour, items: extra } } : {}),
    },
    dayRng(state.seed, day, RNG_PURPOSE.demand),
  );

  // --- Closing-time spoilage (non-cash write-off of perishable stock) ---
  const products = { ...sim.products };
  const spoiled = {} as Record<ProductId, { units: number; valueSen: number }>;
  for (const id of PRODUCT_IDS) {
    const units = Math.floor(products[id].stock * spoilageRate(id, state.upgrades));
    const taken = takeFromStock(products[id], units);
    products[id] = taken.product;
    spoiled[id] = { units, valueSen: taken.costSen };
  }

  // --- Settlement cash transactions ---
  let seq = state.txSeq;
  const settlement: Transaction[] = [];
  const addTx = (type: TransactionType, amountSen: number, label: string, extraFields: Pick<Transaction, 'productId' | 'quantity'> = {}): void => {
    if (amountSen === 0) return;
    settlement.push(makeTx(state, seq++, type, amountSen, label, extraFields));
  };

  if (promo.costSen > 0) addTx('marketing', -promo.costSen, `Promosi: ${promo.name}`);
  for (const id of PRODUCT_IDS) {
    const line = sim.lines[id];
    if (line.sold > 0) addTx('sale', line.revenueSen, `Jualan ${PRODUCTS[id].name} ×${line.sold}`, { productId: id, quantity: line.sold });
  }
  const eventCash = event?.effects.cashSen ?? 0;
  if (event && eventCash < 0) addTx('event_cost', eventCash, event.def.title);
  if (event && eventCash > 0) addTx('event_income', eventCash, event.def.title);
  for (const member of state.staff) {
    addTx('wages', -member.wageSen, `${wagesLabelPrefix(member.name)}${STAFF_ROLES[member.role].name})`);
  }
  const rentSen = dailyRent();
  const utilitiesSen = dailyUtilities(state.upgrades, sim.customers.served);
  addTx('rent', -rentSen, 'Sewa premis');
  addTx('utilities', -utilitiesSen, 'Elektrik & air');

  // Loan installment, charged even if cash runs short (which counts toward bankruptcy).
  let loanAfter = state.loan;
  let loanRepaidToday = false;
  const due = installmentDue(state.loan, day);
  if (state.loan && due) {
    const name = LOAN_OFFERS[state.loan.offerId].name;
    addTx('loan_interest', -due.interestSen, `Faedah ${name} (${due.number}/${state.loan.termDays})`);
    addTx('loan_principal', -due.principalSen, `Pokok ${name} (${due.number}/${state.loan.termDays})`);
    loanAfter = afterInstallment(state.loan, due);
    loanRepaidToday = loanAfter === null;
  }

  const prepTx = state.dayTransactions;
  const allTx = [...prepTx, ...settlement];
  const closingCashSen = state.cashSen + sumSen(settlement.map((t) => t.amountSen));
  const totalOf = (type: TransactionType): number =>
    sumSen(allTx.filter((t) => t.type === type).map((t) => t.amountSen));
  // Outflows are negative transactions; report them as positive amounts (avoiding -0).
  const paidFor = (type: TransactionType): number => 0 - totalOf(type);

  // --- Profit & loss ---
  const revenueSen = sumSen(PRODUCT_IDS.map((id) => sim.lines[id].revenueSen));
  const cogsSen = sumSen(PRODUCT_IDS.map((id) => sim.lines[id].cogsSen));
  const spoilageSen = sumSen(PRODUCT_IDS.map((id) => spoiled[id].valueSen));
  const otherIncomeSen = totalOf('event_income');
  const expenses: ExpenseBreakdown = {
    wagesSen: paidFor('wages'),
    rentSen: paidFor('rent'),
    utilitiesSen: paidFor('utilities'),
    marketingSen: paidFor('marketing'),
    hiringSen: paidFor('hiring'),
    eventCostSen: paidFor('event_cost'),
    spoilageSen,
    interestSen: paidFor('loan_interest'),
    otherSen: 0,
  };
  expenses.otherSen = expenses.hiringSen + expenses.eventCostSen + expenses.spoilageSen + expenses.interestSen;
  const totalExpensesSen =
    expenses.wagesSen + expenses.rentSen + expenses.utilitiesSen + expenses.marketingSen + expenses.otherSen;
  const grossProfitSen = revenueSen - cogsSen;
  const netProfitSen = grossProfitSen + otherIncomeSen - totalExpensesSen;

  // --- Reputation ---
  let eventRep = event?.effects.reputationDelta ?? 0;
  let reviewerDelta = 0;
  const reviewer = event?.effects.reviewer;
  if (reviewer) {
    const pleased = sim.customers.serviceRate >= reviewer.minServiceRate && sim.priceIndex <= 1.15;
    reviewerDelta = pleased ? reviewer.goodDelta : reviewer.badDelta;
    eventRep += reviewerDelta;
  }
  const rep = reputationChange({
    reputation: state.reputation,
    customers: sim.customers,
    priceIndex: sim.priceIndex,
    upgrades: state.upgrades,
    promotionDelta: promo.reputationDelta,
    eventDelta: eventRep,
  });

  // --- Timeline ---
  const timeline: TimelineEntry[] = [
    {
      hour: 8,
      tone: 'neutral',
      text: `Kafe dibuka. Hari ${weekdayName(day)}, kapasiti ${capacityForHour(8, baseHourlyCapacity, mods)} pesanan sejam.`,
    },
  ];
  if (promotionSkipped) {
    timeline.push({ hour: 8, tone: 'warn', text: `Promosi "${chosenPromo.name}" dibatalkan — tunai tidak mencukupi.` });
  } else if (promo.id !== 'none') {
    timeline.push({ hour: 8, tone: 'good', text: `Promosi berjalan: ${promo.name}.` });
  }
  let eventOutcome: string | null = null;
  if (event) {
    eventOutcome = describeEvent(event, sim.customers, reviewerDelta, sim.extraOrder);
    const tone = event.def.tone === 'good' || event.mitigated || reviewerDelta > 0 ? 'good' : event.def.tone === 'bad' || reviewerDelta < 0 ? 'bad' : 'neutral';
    timeline.push({ hour: event.def.hour, tone, text: `${event.def.title}. ${eventOutcome}`.trim() });
  }
  timeline.push(...sim.timeline);
  timeline.push({
    hour: 20,
    tone: 'neutral',
    text: `Kafe ditutup pada ${formatHour(20)}. ${sim.customers.served} pelanggan dilayan.`,
  });
  // Stable sort by hour keeps same-hour entries in insertion order.
  const sortedTimeline = timeline.map((t, i) => ({ t, i })).sort((a, b) => a.t.hour - b.t.hour || a.i - b.i).map((x) => x.t);

  const productLines: ProductDayLine[] = PRODUCT_IDS.map((id) => ({
    productId: id,
    demanded: sim.lines[id].demanded,
    sold: sim.lines[id].sold,
    unmetStockout: sim.lines[id].unmetStockout,
    revenueSen: sim.lines[id].revenueSen,
    cogsSen: sim.lines[id].cogsSen,
    spoiledUnits: spoiled[id].units,
    spoiledValueSen: spoiled[id].valueSen,
    closingStock: products[id].stock,
    salePriceSen: sim.lines[id].salePriceSen,
  }));

  const report: DayReport = {
    day,
    cafeName: state.cafeName,
    eventId: event?.def.id ?? null,
    eventOutcome,
    promotionId: promo.id,
    promotionSkipped,
    revenueSen,
    otherIncomeSen,
    cogsSen,
    grossProfitSen,
    expenses,
    totalExpensesSen,
    netProfitSen,
    openingCashSen: state.dayStart.cashSen,
    closingCashSen,
    stockPurchasesSen: paidFor('stock_purchase'),
    capexSen: paidFor('upgrade'),
    loanProceedsSen: totalOf('loan_proceeds'),
    loanPrincipalRepaidSen: paidFor('loan_principal'),
    openingDebtSen: state.dayStart.debtSen,
    closingDebtSen: remainingPrincipal(loanAfter),
    openingInventorySen: state.dayStart.inventorySen,
    closingInventorySen: inventoryValue(products),
    reputationBefore: state.reputation,
    reputationAfter: rep.after,
    customers: sim.customers,
    products: productLines,
    hourly: sim.hourly,
    timeline: sortedTimeline,
    transactions: allTx,
    objectivesCompleted: [],
    goal: state.goal ? goalResult(state.goal, revenueSen) : null,
  };

  // --- Stats & status ---
  const anyStockout = productLines.some((l) => l.unmetStockout > 0) || sim.customers.lostStock > 0;
  const negativeCashStreak = closingCashSen < 0 ? state.stats.negativeCashStreak + 1 : 0;
  const goalMet = report.goal?.achieved === true;
  const saturdayGoalMet = state.history.find((r) => r.day === day - 1)?.goal?.achieved === true;
  const stats = {
    daysCompleted: state.stats.daysCompleted + 1,
    totalServed: state.stats.totalServed + sim.customers.served,
    totalRevenueSen: state.stats.totalRevenueSen + revenueSen,
    totalNetProfitSen: state.stats.totalNetProfitSen + netProfitSen,
    bestDayRevenueSen: Math.max(state.stats.bestDayRevenueSen, revenueSen),
    profitableDays: state.stats.profitableDays + (netProfitSen > 0 ? 1 : 0),
    profitStreak: netProfitSen > 0 ? state.stats.profitStreak + 1 : 0,
    perfectServiceDays: state.stats.perfectServiceDays + (!anyStockout && sim.customers.served >= 50 ? 1 : 0),
    negativeCashStreak,
    loansRepaid: state.stats.loansRepaid + (loanRepaidToday ? 1 : 0),
    goalsMet: state.stats.goalsMet + (goalMet ? 1 : 0),
    holidayGoalsMet: state.stats.holidayGoalsMet + (goalMet && report.goal?.kind === 'holiday' ? 1 : 0),
    perfectWeekends: state.stats.perfectWeekends + (goalMet && isSunday(day) && saturdayGoalMet ? 1 : 0),
  };

  const settled: GameState = {
    ...state,
    phase: 'closed',
    status: negativeCashStreak >= BANKRUPTCY_NEGATIVE_DAYS ? 'bankrupt' : 'active',
    cashSen: closingCashSen,
    reputation: rep.after,
    products,
    txSeq: seq,
    dayTransactions: [],
    lastSettledDay: day,
    stats,
    loan: loanAfter,
  };

  const evaluated = evaluateObjectives(settled);
  const finalReport: DayReport = {
    ...report,
    objectivesCompleted: evaluated.state.completedObjectives.filter((o) => o.day === day).map((o) => o.id),
  };
  const finalState: GameState = {
    ...evaluated.state,
    history: [...state.history, finalReport].slice(-HISTORY_LIMIT),
  };

  return {
    ok: true,
    state: finalState,
    report: finalReport,
    newObjectives: evaluated.newlyCompleted,
    message: `Hari ${day} selesai. Untung bersih ${formatRM(netProfitSen)}.`,
  };
}

/** Move from a settled day to the preparation phase of the next day. */
export function startNextDay(state: GameState, day: number): EngineResult {
  if (state.status !== 'active') return fail('GAME_OVER', 'Permainan telah tamat. Mulakan permainan baharu.');
  if (day !== state.day) return fail('STALE_DAY', 'Permintaan untuk hari yang salah diabaikan.');
  if (state.phase !== 'closed') return fail('WRONG_PHASE', 'Hari ini belum diproses.');
  const nextDay = state.day + 1;
  const todayEventId = rollEventForDay(state.seed, nextDay);
  const next: GameState = {
    ...state,
    day: nextDay,
    phase: 'prep',
    promotion: 'none',
    todayEventId,
    goal: dayGoalFor(nextDay, todayEventId, state.history),
    dayStart: {
      cashSen: state.cashSen,
      inventorySen: inventoryValue(state.products),
      debtSen: remainingPrincipal(state.loan),
      staffNames: state.staff.map((s) => s.name),
      cafeName: state.cafeName,
      priceSen: menuPrices(state.products),
    },
    dayTransactions: [],
  };
  const goalNote = next.goal ? ` ${GOAL_TITLE[next.goal.kind]}: jualan ${formatRM(next.goal.targetSen)}.` : '';
  return succeed(next, `Selamat pagi! Hari ${nextDay} (${weekdayName(nextDay)}) bermula.${goalNote}`);
}
