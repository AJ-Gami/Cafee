/**
 * Branches. Up to one per location, each selling the same menu at the same prices (and running
 * the same promotion) as the main café, from its own ingredient stock sent from the central store.
 * Its location sets its rent, weekday pattern, favourite products and price sensitivity; it builds
 * its own reputation, is staffed with 1–3 baristas on a fixed wage and can have its own upgrades.
 * Events happen at the main café; only a public holiday also changes a branch's footfall.
 */
import {
  ASSET_LIFE_DAYS,
  BRANCH_BARISTA_ORDERS_PER_HOUR,
  BRANCH_BARISTA_WAGE_SEN,
  BRANCH_LEVELS,
  BRANCH_LIFE_DAYS,
  BRANCH_STARTING_REPUTATION,
  WEEKDAY_FACTORS,
} from './constants';
import { BRANCH_UPGRADES } from './data/branchUpgrades';
import { BRANCH_LOCATIONS } from './data/branches';
import { INGREDIENTS } from './data/ingredients';
import { PROMOTIONS, type PromotionDef } from './data/promotions';
import { buildModifiers, estimateDemand, weekdayIndex, type DemandEstimate, type DemandModifiers } from './demand';
import { recipeOf } from './economy';
import { isEventVisibleInPrep } from './events';
import { hourlyCapacity } from './staff';
import type {
  BranchLocationId,
  BranchState,
  BranchUpgradeAsset,
  BranchUpgradeId,
  EventId,
  GameState,
  IngredientId,
  StaffMember,
  StockHolding,
} from './types';
import { INGREDIENT_IDS, PRODUCT_IDS } from './types';

export { branchFixedCosts, branchUtilities } from './economy';

export function emptyStock(): Record<IngredientId, StockHolding> {
  return Object.fromEntries(INGREDIENT_IDS.map((id) => [id, { stock: 0, stockValueSen: 0 }])) as Record<IngredientId, StockHolding>;
}

export function newBranch(location: BranchLocationId, day: number): BranchState {
  return {
    location,
    openedDay: day,
    reputation: BRANCH_STARTING_REPUTATION,
    baristas: 1,
    fitOut: { costSen: BRANCH_LOCATIONS[location].setupCostSen, lifeDays: BRANCH_LIFE_DAYS, acquiredDay: day, chargedDays: 0 },
    upgrades: [],
    ingredients: emptyStock(),
  };
}

export function newBranchUpgrade(id: BranchUpgradeId, day: number): BranchUpgradeAsset {
  return { id, costSen: BRANCH_UPGRADES[id].costSen, lifeDays: ASSET_LIFE_DAYS, acquiredDay: day, chargedDays: 0 };
}

/** The café level needed to open one more branch, or null when every location is taken. */
export function nextBranchLevel(state: GameState): number | null {
  return BRANCH_LEVELS[state.branches.length] ?? null;
}

function hasUpgrade(branch: BranchState, id: BranchUpgradeId): boolean {
  return branch.upgrades.some((u) => u.id === id);
}

/** The branch's team, as staff members for the capacity rules. */
export function branchStaff(branch: BranchState): StaffMember[] {
  const ordersPerHour = Math.round(BRANCH_BARISTA_ORDERS_PER_HOUR * (hasUpgrade(branch, 'mesin') ? (BRANCH_UPGRADES.mesin.capacityMultiplier ?? 1) : 1));
  return Array.from({ length: branch.baristas }, (_, i) => ({
    id: `cawangan-${i + 1}`,
    name: `Barista cawangan ${i + 1}`,
    role: 'barista' as const,
    wageSen: BRANCH_BARISTA_WAGE_SEN,
    ordersPerHour,
    hiredDay: branch.openedDay,
  }));
}

export function branchHourlyCapacity(branch: BranchState): number {
  return hourlyCapacity(branchStaff(branch), []);
}

/** Share of the branch's own perishable stock that spoils overnight. */
export function branchSpoilageRate(branch: BranchState, id: IngredientId): number {
  let rate = INGREDIENTS[id].spoilageRate;
  for (const u of branch.upgrades) rate *= BRANCH_UPGRADES[u.id].spoilageMultiplier?.[id] ?? 1;
  return rate;
}

/**
 * Demand modifiers at a branch: the promotion (as at the main café), its location and its
 * upgrades. The location's weekday pattern replaces the main café's, which the footfall model
 * applies itself.
 */
export function branchModifiers(branch: BranchState, day: number, promotion: PromotionDef, eventId: EventId | null): DemandModifiers {
  const loc = BRANCH_LOCATIONS[branch.location];
  const base = buildModifiers([], promotion, null);
  const weekday = weekdayIndex(day);
  const weekdayAdjust = (loc.weekdayFactors[weekday] ?? 1) / (WEEKDAY_FACTORS[weekday] ?? 1);
  const holiday = eventId === 'public_holiday' ? loc.holidayFactor : 1;
  const upgrades = branch.upgrades.reduce((m, u) => m * (BRANCH_UPGRADES[u.id].trafficMultiplier ?? 1), 1);
  const productDemand = { ...base.productDemand };
  for (const id of PRODUCT_IDS) productDemand[id] *= loc.productDemand[id] ?? 1;
  return {
    ...base,
    footfallMultiplier: base.footfallMultiplier * loc.footfallMultiplier * weekdayAdjust * holiday * upgrades,
    conversionBonus: base.conversionBonus + loc.conversionBonus,
    productDemand,
  };
}

/** Today's demand estimate at a branch, from what the player can see while preparing. */
export function branchEstimate(state: GameState, branch: BranchState): DemandEstimate {
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? state.todayEventId : null;
  const mods = branchModifiers(branch, state.day, PROMOTIONS[state.promotion], visibleEvent);
  return estimateDemand(state.day, branch.reputation, state.products, branchStaff(branch), [], mods);
}

/**
 * Stock to send a branch for today: its estimated need for each ingredient (with a safety margin
 * for ingredients that keep, none for perishables), less what it already holds.
 */
export function branchSupplyNeeds(state: GameState, branch: BranchState): Record<IngredientId, { need: number; shortfall: number }> {
  const est = branchEstimate(state, branch);
  const need = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])) as Record<IngredientId, number>;
  for (const p of PRODUCT_IDS) {
    if (!state.products[p].enabled) continue;
    for (const [id, qty] of recipeOf(p)) need[id] += est.perProduct[p] * qty;
  }
  return Object.fromEntries(
    INGREDIENT_IDS.map((id) => {
      const target = Math.ceil((need[id] * (branchSpoilageRate(branch, id) >= 0.2 ? 1.0 : 1.15)) / 5) * 5;
      return [id, { need: need[id], shortfall: Math.max(0, target - branch.ingredients[id].stock) }];
    }),
  ) as Record<IngredientId, { need: number; shortfall: number }>;
}

export interface MorningTransfer {
  location: BranchLocationId;
  units: Record<IngredientId, number>;
}

/**
 * The stock each branch receives from the central store when the café opens: its shortfall for
 * today, branch by branch in the order they were opened, as far as the central stock goes. The
 * main café then sells from what is left.
 */
export function planMorningTransfers(state: GameState): { transfers: MorningTransfer[]; centralLeft: Record<IngredientId, number> } {
  const centralLeft = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, state.ingredients[id].stock])) as Record<IngredientId, number>;
  const transfers = state.branches.map((branch) => {
    const needs = branchSupplyNeeds(state, branch);
    const units = Object.fromEntries(
      INGREDIENT_IDS.map((id) => {
        const send = Math.min(needs[id].shortfall, centralLeft[id]);
        centralLeft[id] -= send;
        return [id, send];
      }),
    ) as Record<IngredientId, number>;
    return { location: branch.location, units };
  });
  return { transfers, centralLeft };
}
