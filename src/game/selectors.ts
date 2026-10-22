/**
 * Read-only views over the game state for the UI. Every number the UI shows
 * (margins, estimates, quotes, capacity) comes from here or the engine.
 */
import { LOW_STOCK_RATIO, MAX_PURCHASE_QTY, MAX_STOCK_PER_PRODUCT } from './constants';
import { EVENTS } from './data/events';
import { LOAN_OFFER_ORDER, LOAN_OFFERS, type LoanOfferDef } from './data/loans';
import { OBJECTIVES } from './data/objectives';
import { PRODUCTS } from './data/products';
import { PROMOTION_ORDER, PROMOTIONS, type PromotionDef } from './data/promotions';
import { UPGRADE_ORDER, UPGRADES, type UpgradeDef } from './data/upgrades';
import { estimateDemand, modifiersForState, reputationPoints, salePrice, weekdayIndex, type DemandEstimate } from './demand';
import { averageUnitCost, canAfford, inventoryValue, projectedFixedCosts, quotePurchase, todaysUnitCost } from './economy';
import { bookValue, newAsset, nextCharge, totalBookValue } from './assets';
import { isEventVisibleInPrep, resolveEvent } from './events';
import { GOAL_TITLE, goalRaisePercent } from './goals';
import { installment, offerTotalInterest, remainingPrincipal, settlementQuote, type Installment, type SettlementQuote } from './loans';
import { formatRM, marginPercent } from './money';
import { currentLevel, isObjectiveComplete } from './objectives';
import { candidatesForState, hourlyCapacity, staffSlots } from './staff';
import type { ActiveLoan, DayGoal, DayReport, GameState, ProductId, StaffCandidate } from './types';
import { PRODUCT_IDS } from './types';

/** Demand estimate using only information the player can see (forecast events, not surprises). */
export function dayEstimate(state: GameState): DemandEstimate {
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? resolveEvent(state.todayEventId, state.upgrades) : null;
  const mods = modifiersForState(state, visibleEvent);
  return estimateDemand(state.day, state.reputation, state.products, state.staff, state.upgrades, mods);
}

export type PricePerception = 'cheap' | 'fair' | 'pricey' | 'too_expensive';

export function pricePerception(productId: ProductId, priceSen: number): PricePerception {
  const ratio = priceSen / PRODUCTS[productId].referencePriceSen;
  if (ratio < 0.9) return 'cheap';
  if (ratio <= 1.1) return 'fair';
  if (ratio <= 1.3) return 'pricey';
  return 'too_expensive';
}

export const PRICE_PERCEPTION_LABEL: Record<PricePerception, string> = {
  cheap: 'Murah',
  fair: 'Berpatutan',
  pricey: 'Mahal',
  too_expensive: 'Terlalu mahal',
};

export type StockLevel = 'out' | 'low' | 'ok' | 'off';

export interface ProductView {
  id: ProductId;
  name: string;
  enabled: boolean;
  priceSen: number;
  /** Price after today's promotion discount. */
  salePriceSen: number;
  /** Supplier cost per unit today (includes event surcharge). */
  unitCostSen: number;
  surchargeBps: number;
  marginSen: number;
  marginPct: number;
  perception: PricePerception;
  stock: number;
  stockValueSen: number;
  avgCostSen: number;
  estimatedDemand: number;
  stockLevel: StockLevel;
  suggestedPurchase: number;
  spoilageRate: number;
  maxPurchase: number;
}

export function productViews(state: GameState): ProductView[] {
  const estimate = dayEstimate(state);
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? resolveEvent(state.todayEventId, state.upgrades) : null;
  const mods = modifiersForState(state, visibleEvent);
  return PRODUCT_IDS.map((id) => {
    const p = state.products[id];
    const def = PRODUCTS[id];
    const { unitCostSen, surchargeBps } = todaysUnitCost(state, id);
    const est = estimate.perProduct[id];
    let stockLevel: StockLevel = 'ok';
    if (!p.enabled) stockLevel = 'off';
    else if (p.stock === 0) stockLevel = 'out';
    else if (p.stock < est * LOW_STOCK_RATIO || p.stock < est) stockLevel = 'low';
    // Perishables get a smaller safety buffer.
    const buffer = def.spoilageRate >= 0.2 ? 1.0 : 1.15;
    const target = Math.ceil((est * buffer) / 5) * 5;
    const suggestedPurchase = p.enabled ? Math.max(0, Math.min(target - p.stock, MAX_STOCK_PER_PRODUCT - p.stock)) : 0;
    const priceSen = p.priceSen;
    const sp = salePrice(p, mods);
    return {
      id,
      name: def.name,
      enabled: p.enabled,
      priceSen,
      salePriceSen: sp,
      unitCostSen,
      surchargeBps,
      marginSen: sp - unitCostSen,
      marginPct: marginPercent(sp, unitCostSen),
      perception: pricePerception(id, sp),
      stock: p.stock,
      stockValueSen: p.stockValueSen,
      avgCostSen: averageUnitCost(p),
      estimatedDemand: est,
      stockLevel,
      suggestedPurchase,
      spoilageRate: def.spoilageRate,
      maxPurchase: Math.max(0, Math.min(MAX_PURCHASE_QTY, MAX_STOCK_PER_PRODUCT - p.stock)),
    };
  });
}

export function restockPlan(state: GameState): { items: { productId: ProductId; quantity: number }[]; totalSen: number } {
  const items = productViews(state)
    .filter((v) => v.suggestedPurchase > 0)
    .map((v) => ({ productId: v.id, quantity: Math.min(v.suggestedPurchase, v.maxPurchase) }))
    .filter((i) => i.quantity > 0);
  const totalSen = items.reduce((sum, i) => sum + quotePurchase(state, i.productId, i.quantity).totalSen, 0);
  return { items, totalSen };
}

export interface CapacityView {
  perHour: number;
  perDay: number;
  staffCount: number;
  slots: number;
}

export function capacityView(state: GameState): CapacityView {
  const perHour = hourlyCapacity(state.staff, state.upgrades);
  return { perHour, perDay: perHour * 12, staffCount: state.staff.length, slots: staffSlots(state.upgrades) };
}

/** Orders per hour before and after hiring a candidate, including upgrade multipliers. */
export function capacityAfterHire(state: GameState, candidate: StaffCandidate): { before: number; after: number; gain: number } {
  const before = hourlyCapacity(state.staff, state.upgrades);
  const { hireFeeSen: _fee, ...member } = candidate;
  const after = hourlyCapacity([...state.staff, member], state.upgrades);
  return { before, after, gain: after - before };
}

export function hiringCandidates(state: GameState): StaffCandidate[] {
  return candidatesForState(state);
}

export interface PromotionView extends PromotionDef {
  locked: boolean;
  affordable: boolean;
  selected: boolean;
}

export function promotionViews(state: GameState): PromotionView[] {
  const level = currentLevel(state);
  return PROMOTION_ORDER.map((id) => {
    const def = PROMOTIONS[id];
    return { ...def, locked: level < def.minLevel, affordable: canAfford(def.costSen, state.cashSen), selected: state.promotion === id };
  });
}

export interface UpgradeView extends UpgradeDef {
  owned: boolean;
  locked: boolean;
  affordable: boolean;
  /** Depreciation per close and the closes it lasts (for an upgrade not yet bought, if bought today). */
  dailyDepreciationSen: number;
  lifeDays: number;
  /** For an upgrade owned: its book value and the closes of depreciation left. */
  asset: { bookValueSen: number; daysLeft: number } | null;
}

export function upgradeViews(state: GameState): UpgradeView[] {
  const level = currentLevel(state);
  return UPGRADE_ORDER.map((id) => {
    const def = UPGRADES[id];
    const owned = state.assets.find((a) => a.upgradeId === id);
    const asset = owned ?? newAsset(id, state.day);
    return {
      ...def,
      owned: state.upgrades.includes(id),
      locked: level < def.minLevel,
      affordable: def.costSen <= state.cashSen,
      dailyDepreciationSen: nextCharge(asset),
      lifeDays: asset.lifeDays,
      asset: owned ? { bookValueSen: bookValue(owned), daysLeft: owned.lifeDays - owned.chargedDays } : null,
    };
  });
}

/** Book value of the café's fixed assets now. */
export function fixedAssetsValue(state: GameState): number {
  return totalBookValue(state.assets);
}

export interface ObjectiveView {
  id: string;
  title: string;
  description: string;
  xp: number;
  target: number;
  current: number;
  unit: 'count' | 'sen' | 'points';
  complete: boolean;
}

export function objectiveViews(state: GameState): ObjectiveView[] {
  return OBJECTIVES.map((o) => {
    const complete = isObjectiveComplete(state, o.id);
    // Reputation is shown in whole points (rounded down) so progress never looks complete early.
    const raw = o.unit === 'points' ? reputationPoints(o.progress(state)) : o.progress(state);
    const current = complete ? o.target : Math.min(o.target, Math.max(0, raw));
    return { id: o.id, title: o.title, description: o.description, xp: o.xp, target: o.target, current, unit: o.unit, complete };
  });
}

export interface VisibleEvent {
  title: string;
  description: string;
  tone: 'good' | 'bad' | 'mixed';
  mitigationNote: string | null;
}

/** Today's event as the player is allowed to see it (surprises stay hidden until opening). */
export function visibleTodayEvent(state: GameState): VisibleEvent | null {
  if (state.phase === 'prep' && !isEventVisibleInPrep(state.todayEventId)) return null;
  const resolved = resolveEvent(state.todayEventId, state.upgrades);
  if (!resolved) return null;
  return {
    title: resolved.def.title,
    description: resolved.def.description,
    tone: resolved.def.tone,
    mitigationNote: resolved.mitigationNote,
  };
}

export interface GoalView {
  goal: DayGoal;
  title: string;
  /** How far the target is above the recent average, in whole percent. */
  raisePercent: number;
}

/** Today's sales goal while preparing (null on days without one). */
export function todayGoalView(state: GameState): GoalView | null {
  if (state.status !== 'active' || state.phase !== 'prep' || !state.goal) return null;
  return { goal: state.goal, title: GOAL_TITLE[state.goal.kind], raisePercent: goalRaisePercent(state.goal.kind) };
}

/** Preparing a Friday: the weekend goals start tomorrow. */
export function weekendGoalsTomorrow(state: GameState): boolean {
  return state.status === 'active' && state.phase === 'prep' && weekdayIndex(state.day) === 4;
}

export function lastReport(state: GameState): DayReport | null {
  return state.history[state.history.length - 1] ?? null;
}

export function reportForDay(state: GameState, day: number): DayReport | null {
  return state.history.find((r) => r.day === day) ?? null;
}

export function fixedCostsView(state: GameState) {
  return projectedFixedCosts(state);
}

export function currentInventoryValue(state: GameState): number {
  return inventoryValue(state.products);
}

/** Sum of today's preparation cash movements by type (for the live ledger). */
export function todaysSpending(state: GameState): number {
  return state.dayTransactions.reduce((sum, t) => sum + t.amountSen, 0);
}

export interface PrepChecklistItem {
  id: string;
  label: string;
  detail: string;
  status: 'ok' | 'warn' | 'bad';
}

export function prepChecklist(state: GameState): PrepChecklistItem[] {
  const views = productViews(state);
  const enabled = views.filter((v) => v.enabled);
  const out = enabled.filter((v) => v.stockLevel === 'out');
  const low = enabled.filter((v) => v.stockLevel === 'low');
  const cap = capacityView(state);
  const est = dayEstimate(state);
  const fixed = projectedFixedCosts(state);
  const promo = PROMOTIONS[state.promotion];
  const items: PrepChecklistItem[] = [];

  if (enabled.length === 0) {
    items.push({ id: 'menu', label: 'Menu kosong', detail: 'Aktifkan sekurang-kurangnya satu produk.', status: 'bad' });
  } else if (out.length === enabled.length) {
    items.push({ id: 'stock', label: 'Tiada stok langsung', detail: 'Beli stok sebelum membuka kafe.', status: 'bad' });
  } else if (out.length > 0 || low.length > 0) {
    const names = [...out, ...low].map((v) => v.name).join(', ');
    items.push({ id: 'stock', label: 'Stok mungkin tidak cukup', detail: names, status: out.length > 0 ? 'bad' : 'warn' });
  } else {
    items.push({ id: 'stock', label: 'Stok mencukupi', detail: 'Semua produk menu ada stok mengikut anggaran.', status: 'ok' });
  }

  items.push({
    id: 'capacity',
    label: `Kapasiti ${cap.perHour} pesanan/jam`,
    detail:
      est.footfall > cap.perDay
        ? `Anggaran ${est.footfall} pelanggan melebihi kapasiti ${cap.perDay} sehari.`
        : `Anggaran ${est.footfall} pelanggan, kapasiti ${cap.perDay} sehari.`,
    status: est.footfall > cap.perDay ? 'warn' : 'ok',
  });

  items.push({
    id: 'promo',
    label: promo.id === 'none' ? 'Tiada promosi' : `Promosi: ${promo.name}`,
    detail:
      !canAfford(promo.costSen, state.cashSen)
        ? 'Tunai tidak cukup — promosi akan dibatalkan.'
        : promo.costSen > 0
          ? 'Kos dibayar semasa kafe dibuka.'
          : 'Pilih promosi untuk menarik lebih ramai pelanggan.',
    status: canAfford(promo.costSen, state.cashSen) ? 'ok' : 'warn',
  });

  items.push({
    id: 'costs',
    label: 'Bayaran tetap hari ini',
    detail:
      fixed.loanSen > 0
        ? `Gaji, sewa, utiliti asas & ansuran pinjaman: ${formatRM(fixed.totalSen)} dibayar semasa tutup.`
        : `Gaji, sewa & utiliti asas: ${formatRM(fixed.totalSen)} dibayar semasa tutup.`,
    status: state.cashSen < fixed.totalSen ? 'warn' : 'ok',
  });

  return items;
}

export function eventTitle(id: string | null): string | null {
  if (!id) return null;
  return id in EVENTS ? EVENTS[id as keyof typeof EVENTS].title : null;
}

export interface PricePreview {
  priceSen: number;
  salePriceSen: number;
  marginSen: number;
  marginPct: number;
  perception: PricePerception;
  referencePriceSen: number;
}

/** Margin and customer perception for a price the player is considering (not yet saved). */
export function previewPrice(state: GameState, productId: ProductId, priceSen: number): PricePreview {
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? resolveEvent(state.todayEventId, state.upgrades) : null;
  const mods = modifiersForState(state, visibleEvent);
  const sale = salePrice({ ...state.products[productId], priceSen }, mods);
  const { unitCostSen } = todaysUnitCost(state, productId);
  return {
    priceSen,
    salePriceSen: sale,
    marginSen: sale - unitCostSen,
    marginPct: marginPercent(sale, unitCostSen),
    perception: pricePerception(productId, sale),
    referencePriceSen: PRODUCTS[productId].referencePriceSen,
  };
}

export interface LoanOfferView extends LoanOfferDef {
  totalInterestSen: number;
  totalRepaySen: number;
  /** Typical daily installment (the last one may differ by a few sen). */
  dailyInstallmentSen: number;
  locked: boolean;
}

export function loanOfferViews(state: GameState): LoanOfferView[] {
  const level = currentLevel(state);
  return LOAN_OFFER_ORDER.map((id) => {
    const def = LOAN_OFFERS[id];
    const totalInterestSen = offerTotalInterest(id);
    const first = installment({ principalSen: def.principalSen, totalInterestSen, termDays: def.termDays }, 1);
    return {
      ...def,
      totalInterestSen,
      totalRepaySen: def.principalSen + totalInterestSen,
      dailyInstallmentSen: first.totalSen,
      locked: level < def.minLevel,
    };
  });
}

export interface ActiveLoanView {
  loan: ActiveLoan;
  name: string;
  remainingPrincipalSen: number;
  remainingInterestSen: number;
  paymentsLeft: number;
  /** The next installment to be charged. */
  nextInstallment: Installment;
  /** The next installment is charged at today's close (false: at tomorrow's close). */
  nextChargedToday: boolean;
  /** True while the café is closed: the loan can next be repaid in tomorrow's preparation. */
  actionTomorrow: boolean;
  /** The game has ended: no more installments are charged and the loan can no longer be repaid. */
  gameOver: boolean;
  /** What repaying costs at the next chance to repay (now in preparation, otherwise tomorrow). */
  settlement: SettlementQuote;
  canSettle: boolean;
}

export function activeLoanView(state: GameState): ActiveLoanView | null {
  const loan = state.loan;
  if (!loan) return null;
  const gameOver = state.status !== 'active';
  // Once today is settled, its installment is paid and the next chance to act is tomorrow.
  const actionTomorrow = !gameOver && state.phase !== 'prep';
  const settlement = settlementQuote(loan, actionTomorrow ? state.day + 1 : state.day);
  return {
    loan,
    name: LOAN_OFFERS[loan.offerId].name,
    remainingPrincipalSen: remainingPrincipal(loan),
    remainingInterestSen: loan.totalInterestSen - loan.interestPaidSen,
    paymentsLeft: loan.termDays - loan.paymentsMade,
    nextInstallment: installment(loan, loan.paymentsMade + 1),
    nextChargedToday: !gameOver && !actionTomorrow && state.day > loan.takenDay,
    actionTomorrow,
    gameOver,
    settlement,
    canSettle: !gameOver && settlement.totalSen <= state.cashSen,
  };
}
