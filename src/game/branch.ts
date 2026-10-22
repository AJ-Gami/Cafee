/**
 * The second branch. It sells the same menu at the same prices (and runs the same promotion) as
 * the main café, from the same ingredient stock: the main café is served first and the branch
 * uses what is left. Its location sets its rent, weekday pattern, favourite products and price
 * sensitivity; it builds its own reputation and is staffed with 1–3 baristas on a fixed wage.
 * Events happen at the main café; only a public holiday also changes the branch's footfall.
 */
import {
  BRANCH_BARISTA_ORDERS_PER_HOUR,
  BRANCH_BARISTA_WAGE_SEN,
  BRANCH_LIFE_DAYS,
  BRANCH_STARTING_REPUTATION,
  WEEKDAY_FACTORS,
} from './constants';
import { BRANCH_LOCATIONS } from './data/branches';
import { PROMOTIONS, type PromotionDef } from './data/promotions';
import { buildModifiers, estimateDemand, weekdayIndex, type DemandEstimate, type DemandModifiers } from './demand';
import { isEventVisibleInPrep } from './events';
import { hourlyCapacity } from './staff';
import type { BranchLocationId, BranchState, EventId, GameState, StaffMember } from './types';
import { PRODUCT_IDS } from './types';

export function newBranch(location: BranchLocationId, day: number): BranchState {
  return {
    location,
    openedDay: day,
    reputation: BRANCH_STARTING_REPUTATION,
    baristas: 1,
    fitOut: { costSen: BRANCH_LOCATIONS[location].setupCostSen, lifeDays: BRANCH_LIFE_DAYS, acquiredDay: day, chargedDays: 0 },
  };
}

/** The branch's team, as staff members for the capacity rules (no upgrades apply there). */
export function branchStaff(branch: BranchState): StaffMember[] {
  return Array.from({ length: branch.baristas }, (_, i) => ({
    id: `cawangan-${i + 1}`,
    name: `Barista cawangan ${i + 1}`,
    role: 'barista' as const,
    wageSen: BRANCH_BARISTA_WAGE_SEN,
    ordersPerHour: BRANCH_BARISTA_ORDERS_PER_HOUR,
    hiredDay: branch.openedDay,
  }));
}

export function branchHourlyCapacity(branch: BranchState): number {
  return hourlyCapacity(branchStaff(branch), []);
}

export { branchFixedCosts, branchUtilities } from './economy';

/**
 * Demand modifiers at the branch: the promotion (as at the main café) and its location. The
 * location's weekday pattern replaces the main café's, which the footfall model applies itself.
 */
export function branchModifiers(branch: BranchState, day: number, promotion: PromotionDef, eventId: EventId | null): DemandModifiers {
  const loc = BRANCH_LOCATIONS[branch.location];
  const base = buildModifiers([], promotion, null);
  const weekday = weekdayIndex(day);
  const weekdayAdjust = (loc.weekdayFactors[weekday] ?? 1) / (WEEKDAY_FACTORS[weekday] ?? 1);
  const holiday = eventId === 'public_holiday' ? loc.holidayFactor : 1;
  const productDemand = { ...base.productDemand };
  for (const id of PRODUCT_IDS) productDemand[id] *= loc.productDemand[id] ?? 1;
  return {
    ...base,
    footfallMultiplier: base.footfallMultiplier * loc.footfallMultiplier * weekdayAdjust * holiday,
    conversionBonus: base.conversionBonus + loc.conversionBonus,
    productDemand,
  };
}

/** Today's demand estimate at the branch, from what the player can see while preparing. */
export function branchEstimate(state: GameState): DemandEstimate | null {
  const branch = state.branch;
  if (!branch) return null;
  const visibleEvent = isEventVisibleInPrep(state.todayEventId) ? state.todayEventId : null;
  const mods = branchModifiers(branch, state.day, PROMOTIONS[state.promotion], visibleEvent);
  return estimateDemand(state.day, branch.reputation, state.products, branchStaff(branch), [], mods);
}
