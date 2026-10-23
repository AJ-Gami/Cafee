/**
 * Read-only views over the game state for the UI. Every number the UI shows
 * (margins, estimates, quotes, capacity) comes from here or the engine.
 */
import { HOUR_WEIGHTS, MAX_PURCHASE_QTY, MAX_STOCK_PER_INGREDIENT } from './constants';
import { BRANCH_LOCATION_ORDER, BRANCH_LOCATIONS, type BranchLocationDef } from './data/branches';
import { EVENTS } from './data/events';
import { INGREDIENTS } from './data/ingredients';
import { LOAN_OFFER_ORDER, LOAN_OFFERS, type LoanOfferDef } from './data/loans';
import { OBJECTIVES } from './data/objectives';
import { PRODUCTS } from './data/products';
import { PROMOTION_ORDER, PROMOTIONS, type PromotionDef } from './data/promotions';
import { UPGRADE_ORDER, UPGRADES, type UpgradeDef } from './data/upgrades';
import { estimateDemand, modifiersForState, openHours, reputationPoints, salePrice, weekdayIndex, type DemandEstimate } from './demand';
import {
  averageUnitCost,
  canAfford,
  inventoryValue,
  projectedFixedCosts,
  quotePurchase,
  recipeCostToday,
  recipeOf,
  servingsAvailable,
  spoilageRate,
  todaysUnitCost,
} from './economy';
import { bookValue, branchAssets, fixedAssetsBookValue, newAsset, nextCharge, totalBookValue } from './assets';
import {
  branchEstimate,
  branchFixedCosts,
  branchHourlyCapacity,
  branchSupplyNeeds,
  newBranch,
  newBranchUpgrade,
  nextBranchLevel,
  planMorningTransfers,
} from './branch';
import { BRANCH_UPGRADE_ORDER, BRANCH_UPGRADES, type BranchUpgradeDef } from './data/branchUpgrades';
import { isEventVisibleInPrep, resolveEvent } from './events';
import { GOAL_TITLE, goalRaisePercent } from './goals';
import { installment, offerTotalInterest, remainingPrincipal, settlementQuote, type Installment, type SettlementQuote } from './loans';
import { formatRM, marginPercent, sumSen } from './money';
import { currentLevel, isObjectiveComplete } from './objectives';
import { candidatesForState, hourlyCapacity, staffSlots } from './staff';
import type { ActiveLoan, BranchDayResult, BranchState, DayGoal, DayReport, GameState, IngredientId, ProductId, StaffCandidate } from './types';
import { INGREDIENT_IDS, PRODUCT_IDS } from './types';

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

export interface RecipeItem {
  ingredientId: IngredientId;
  name: string;
  qty: number;
  unitLabel: string;
}

export interface ProductView {
  id: ProductId;
  name: string;
  enabled: boolean;
  priceSen: number;
  /** Price after today's promotion discount. */
  salePriceSen: number;
  /** Cost of one unit's ingredients at today's supplier prices (event surcharges included). */
  unitCostSen: number;
  costRaisedToday: boolean;
  marginSen: number;
  marginPct: number;
  perception: PricePerception;
  recipe: RecipeItem[];
  /** How many the ingredients on hand can make, if no other product used them. */
  servings: number;
  estimatedDemand: number;
  /** out: cannot make one; low: an ingredient falls short of today's estimated need across the menu. */
  stockLevel: StockLevel;
}

export interface IngredientView {
  id: IngredientId;
  name: string;
  description: string;
  unitLabel: string;
  stock: number;
  stockValueSen: number;
  avgCostSen: number;
  /** Supplier cost per unit today (includes event surcharge). */
  unitCostSen: number;
  surchargeBps: number;
  /** Units today's estimated sales would use, over every product on the menu. */
  estimatedNeed: number;
  /** off: no product on today's menu uses it. */
  stockLevel: StockLevel;
  suggestedPurchase: number;
  maxPurchase: number;
  /** Share of the units left at closing that spoil overnight (after upgrades). */
  spoilageRate: number;
  usedBy: { productId: ProductId; name: string; qty: number }[];
}

function recipeItems(productId: ProductId): RecipeItem[] {
  return recipeOf(productId).map(([ingredientId, qty]) => ({
    ingredientId,
    name: INGREDIENTS[ingredientId].name,
    qty,
    unitLabel: INGREDIENTS[ingredientId].unitLabel,
  }));
}

/** Units of each ingredient the main café's estimated sales would use today. */
function mainNeeds(state: GameState): Record<IngredientId, number> {
  const estimate = dayEstimate(state);
  const need = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])) as Record<IngredientId, number>;
  for (const productId of PRODUCT_IDS) {
    if (!state.products[productId].enabled) continue;
    for (const [id, qty] of recipeOf(productId)) need[id] += estimate.perProduct[productId] * qty;
  }
  return need;
}

/** What branches will take from the central store this morning, per ingredient. */
function branchShortfalls(state: GameState): Record<IngredientId, number> {
  const total = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])) as Record<IngredientId, number>;
  for (const branch of state.branches) {
    const needs = branchSupplyNeeds(state, branch);
    for (const id of INGREDIENT_IDS) total[id] += needs[id].shortfall;
  }
  return total;
}

/** Units the central store must cover today: the main café's estimated use and the branches' deliveries. */
function ingredientNeeds(state: GameState): Record<IngredientId, number> {
  const main = mainNeeds(state);
  const branches = branchShortfalls(state);
  return Object.fromEntries(INGREDIENT_IDS.map((id) => [id, main[id] + branches[id]])) as Record<IngredientId, number>;
}

export function productViews(state: GameState): ProductView[] {
  const estimate = dayEstimate(state);
  const need = ingredientNeeds(state);
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? resolveEvent(state.todayEventId, state.upgrades) : null;
  const mods = modifiersForState(state, visibleEvent);
  return PRODUCT_IDS.map((id) => {
    const p = state.products[id];
    const def = PRODUCTS[id];
    const { unitCostSen, surcharged } = recipeCostToday(state, id);
    const servings = servingsAvailable(state.ingredients, id);
    let stockLevel: StockLevel = 'ok';
    if (!p.enabled) stockLevel = 'off';
    else if (servings === 0) stockLevel = 'out';
    else if (recipeOf(id).some(([ingredient]) => state.ingredients[ingredient].stock < need[ingredient])) stockLevel = 'low';
    const sp = salePrice(p, mods);
    return {
      id,
      name: def.name,
      enabled: p.enabled,
      priceSen: p.priceSen,
      salePriceSen: sp,
      unitCostSen,
      costRaisedToday: surcharged,
      marginSen: sp - unitCostSen,
      marginPct: marginPercent(sp, unitCostSen),
      perception: pricePerception(id, sp),
      recipe: recipeItems(id),
      servings,
      estimatedDemand: estimate.perProduct[id],
      stockLevel,
    };
  });
}

export function ingredientViews(state: GameState): IngredientView[] {
  const need = ingredientNeeds(state);
  const main = mainNeeds(state);
  const toBranches = branchShortfalls(state);
  return INGREDIENT_IDS.map((id) => {
    const item = state.ingredients[id];
    const def = INGREDIENTS[id];
    const { unitCostSen, surchargeBps } = todaysUnitCost(state, id);
    const users = PRODUCT_IDS.filter((p) => state.products[p].enabled && (PRODUCTS[p].recipe[id] ?? 0) > 0);
    const minUse = Math.min(...users.map((p) => PRODUCTS[p].recipe[id] ?? 0));
    let stockLevel: StockLevel = 'ok';
    if (users.length === 0 && toBranches[id] === 0) stockLevel = 'off';
    else if (item.stock < minUse) stockLevel = 'out';
    else if (item.stock < need[id]) stockLevel = 'low';
    const rate = spoilageRate(id, state.upgrades);
    // Perishables get a smaller safety buffer (branch deliveries already include theirs).
    const target = Math.ceil((main[id] * (rate >= 0.2 ? 1.0 : 1.15)) / 5) * 5 + toBranches[id];
    const room = MAX_STOCK_PER_INGREDIENT - item.stock;
    return {
      id,
      name: def.name,
      description: def.description,
      unitLabel: def.unitLabel,
      stock: item.stock,
      stockValueSen: item.stockValueSen,
      avgCostSen: averageUnitCost(item),
      unitCostSen,
      surchargeBps,
      estimatedNeed: need[id],
      stockLevel,
      suggestedPurchase: users.length > 0 || toBranches[id] > 0 ? Math.max(0, Math.min(target - item.stock, room)) : 0,
      maxPurchase: Math.max(0, Math.min(MAX_PURCHASE_QTY, room)),
      spoilageRate: rate,
      usedBy: PRODUCT_IDS.filter((p) => (PRODUCTS[p].recipe[id] ?? 0) > 0).map((p) => ({
        productId: p,
        name: PRODUCTS[p].name,
        qty: PRODUCTS[p].recipe[id] ?? 0,
      })),
    };
  });
}

export function restockPlan(state: GameState): { items: { ingredientId: IngredientId; quantity: number }[]; totalSen: number } {
  const items = ingredientViews(state)
    .map((v) => ({ ingredientId: v.id, quantity: Math.min(v.suggestedPurchase, v.maxPurchase) }))
    .filter((i) => i.quantity > 0);
  const totalSen = items.reduce((sum, i) => sum + quotePurchase(state, i.ingredientId, i.quantity).totalSen, 0);
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

/** Book value of the café's fixed assets now (upgrades and each branch's fit-out and upgrades). */
export function fixedAssetsValue(state: GameState): number {
  return fixedAssetsBookValue(state.assets, state.branches);
}

export interface BranchLocationView extends BranchLocationDef {
  /** A branch is already open here. */
  open: boolean;
  /** The café level the next branch needs (null when every location is taken). */
  requiredLevel: number | null;
  locked: boolean;
  affordable: boolean;
  /** Depreciation of the fit-out at each close, and the closes it lasts. */
  dailyDepreciationSen: number;
  lifeDays: number;
  /** Wages (one barista), rent and base utilities at every close. */
  dailyFixedSen: number;
}

export function branchLocationViews(state: GameState): BranchLocationView[] {
  const level = currentLevel(state);
  const requiredLevel = nextBranchLevel(state);
  return BRANCH_LOCATION_ORDER.map((id) => {
    const def = BRANCH_LOCATIONS[id];
    const probe = newBranch(id, state.day);
    const fixed = branchFixedCosts(probe);
    return {
      ...def,
      open: state.branches.some((b) => b.location === id),
      requiredLevel,
      locked: requiredLevel === null || level < requiredLevel,
      affordable: def.setupCostSen <= state.cashSen,
      dailyDepreciationSen: nextCharge(probe.fitOut),
      lifeDays: probe.fitOut.lifeDays,
      dailyFixedSen: fixed.wagesSen + fixed.rentSen + fixed.utilitiesBaseSen,
    };
  });
}

export interface BranchUpgradeView extends BranchUpgradeDef {
  owned: boolean;
  affordable: boolean;
  dailyDepreciationSen: number;
  lifeDays: number;
  bookValueSen: number | null;
}

export interface BranchStockLine {
  ingredientId: IngredientId;
  name: string;
  unitLabel: string;
  stock: number;
  /** Today's estimated use at the branch. */
  need: number;
  /** Units it will receive from the central store when the café opens. */
  delivery: number;
  /** Units it needs but the central store cannot send. */
  missing: number;
}

export interface BranchView {
  def: BranchLocationDef;
  branch: BranchState;
  openedToday: boolean;
  capacityPerHour: number;
  capacityPerDay: number;
  /** Today's estimate (prep) from what the player can see. */
  estimatedFootfall: number;
  fixed: { wagesSen: number; rentSen: number; utilitiesBaseSen: number };
  /** Book value of its fit-out and upgrades. */
  bookValueSen: number;
  dailyDepreciationSen: number;
  daysLeft: number;
  upgrades: BranchUpgradeView[];
  stock: BranchStockLine[];
  /** The branch's day in the latest report, if it traded that day. */
  lastResult: (BranchDayResult & { day: number }) | null;
}

export function branchViews(state: GameState): BranchView[] {
  const report = lastReport(state);
  const { transfers } = planMorningTransfers(state);
  return state.branches.map((branch) => {
    const est = branchEstimate(state, branch);
    const perHour = branchHourlyCapacity(branch);
    const needs = branchSupplyNeeds(state, branch);
    const delivery = transfers.find((t) => t.location === branch.location)?.units;
    const result = report?.branches.find((b) => b.location === branch.location);
    return {
      def: BRANCH_LOCATIONS[branch.location],
      branch,
      openedToday: branch.openedDay === state.day,
      capacityPerHour: perHour,
      capacityPerDay: perHour * openHours().length,
      estimatedFootfall: est.footfall,
      fixed: branchFixedCosts(branch),
      bookValueSen: totalBookValue(branchAssets(branch)),
      dailyDepreciationSen: sumSen(branchAssets(branch).map(nextCharge)),
      daysLeft: branch.fitOut.lifeDays - branch.fitOut.chargedDays,
      upgrades: BRANCH_UPGRADE_ORDER.map((id) => {
        const owned = branch.upgrades.find((u) => u.id === id);
        const probe = owned ?? newBranchUpgrade(id, state.day);
        return {
          ...BRANCH_UPGRADES[id],
          owned: !!owned,
          affordable: BRANCH_UPGRADES[id].costSen <= state.cashSen,
          dailyDepreciationSen: nextCharge(probe),
          lifeDays: probe.lifeDays,
          bookValueSen: owned ? bookValue(owned) : null,
        };
      }),
      stock: INGREDIENT_IDS.filter((id) => needs[id].need > 0 || branch.ingredients[id].stock > 0).map((id) => ({
        ingredientId: id,
        name: INGREDIENTS[id].name,
        unitLabel: INGREDIENTS[id].unitLabel,
        stock: branch.ingredients[id].stock,
        need: needs[id].need,
        delivery: delivery?.[id] ?? 0,
        missing: needs[id].shortfall - (delivery?.[id] ?? 0),
      })),
      lastResult: result && report && report.day >= branch.openedDay ? { ...result, day: report.day } : null,
    };
  });
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

export interface RevenueEstimate {
  /** Revenue if every customer expected today (at every location) could be served. */
  demandSen: number;
  /** Revenue expected with today's stock and service capacity. */
  expectedSen: number;
  /** What holds the expected revenue back most, if anything does noticeably. */
  limitedBy: 'stock' | 'capacity' | null;
}

/** Share of a location's expected buyers its service capacity can serve, hour by hour. */
function capacityShare(perProduct: Record<ProductId, number>, perHour: number): number {
  // Each buyer orders one drink (food is mostly an add-on).
  const buyers = sumSen(PRODUCT_IDS.filter((id) => PRODUCTS[id].kind !== 'food').map((id) => perProduct[id]));
  if (buyers <= 0) return 1;
  const served = HOUR_WEIGHTS.reduce((n, w) => n + Math.min(buyers * w, perHour), 0);
  return served / buyers;
}

/**
 * Today's expected revenue from what the player can see while preparing: the demand estimate at
 * each location, cut to what its staff can serve each hour and to what the stock can make
 * (products sharing an ingredient that falls short are cut alike). Rounded to RM10.
 */
export function revenueEstimate(state: GameState): RevenueEstimate {
  const price = Object.fromEntries(productViews(state).map((v) => [v.id, v.salePriceSen])) as Record<ProductId, number>;
  // Each location sells from its own stock: branches after this morning's deliveries, the main
  // café from what the central store has left.
  const { transfers, centralLeft } = planMorningTransfers(state);
  const locations: { perProduct: Record<ProductId, number>; perHour: number; stock: Record<IngredientId, number> }[] = [
    { perProduct: dayEstimate(state).perProduct, perHour: capacityView(state).perHour, stock: centralLeft },
    ...state.branches.map((b) => {
      const delivered = transfers.find((t) => t.location === b.location)?.units;
      return {
        perProduct: branchEstimate(state, b).perProduct,
        perHour: branchHourlyCapacity(b),
        stock: Object.fromEntries(INGREDIENT_IDS.map((id) => [id, b.ingredients[id].stock + (delivered?.[id] ?? 0)])) as Record<IngredientId, number>,
      };
    }),
  ];
  const enabled = PRODUCT_IDS.filter((id) => state.products[id].enabled);

  let demand = 0;
  let afterCapacity = 0;
  let expected = 0;
  for (const { perProduct, perHour, stock } of locations) {
    const share = capacityShare(perProduct, perHour);
    const need = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])) as Record<IngredientId, number>;
    for (const id of enabled) {
      demand += perProduct[id] * price[id];
      afterCapacity += perProduct[id] * share * price[id];
      for (const [ing, qty] of recipeOf(id)) need[ing] += perProduct[id] * share * qty;
    }
    // Products sharing an ingredient that falls short are cut alike.
    const ratio = (ing: IngredientId): number => (need[ing] <= 0 ? 1 : Math.min(1, stock[ing] / need[ing]));
    for (const id of enabled) expected += perProduct[id] * share * Math.min(...recipeOf(id).map(([ing]) => ratio(ing))) * price[id];
  }

  const capacityLoss = demand - afterCapacity;
  const stockLoss = afterCapacity - expected;
  const round = (sen: number): number => Math.round(sen / 1_000) * 1_000;
  return {
    demandSen: round(demand),
    expectedSen: round(expected),
    limitedBy: expected >= demand * 0.97 ? null : stockLoss >= capacityLoss ? 'stock' : 'capacity',
  };
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
  return inventoryValue(state.ingredients);
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

  for (const branch of branchViews(state)) {
    const missing = branch.stock.filter((l) => l.missing > 0);
    const overCapacity = branch.estimatedFootfall > branch.capacityPerDay;
    items.push({
      id: `branch-${branch.branch.location}`,
      label: `Cawangan ${branch.def.shortName}: ${branch.branch.baristas} barista`,
      detail: [
        overCapacity
          ? `Anggaran ${branch.estimatedFootfall} pelanggan melebihi kapasiti ${branch.capacityPerDay} sehari.`
          : `Anggaran ${branch.estimatedFootfall} pelanggan, kapasiti ${branch.capacityPerDay} sehari.`,
        missing.length > 0
          ? `Stor pusat tidak cukup untuk dihantar: ${missing.map((l) => l.name).join(', ')}.`
          : 'Bahan dihantar daripada stor pusat semasa kafe dibuka.',
      ].join(' '),
      status: missing.length > 0 || overCapacity ? 'warn' : 'ok',
    });
  }

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
      `Gaji, sewa, utiliti asas${fixed.branchSen > 0 ? ' (termasuk cawangan)' : ''}${fixed.loanSen > 0 ? ' & ansuran pinjaman' : ''}: ${formatRM(fixed.totalSen)} dibayar semasa tutup.`,
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
  const { unitCostSen } = recipeCostToday(state, productId);
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
