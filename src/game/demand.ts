/**
 * Customer demand. Footfall depends on reputation, weekday, promotions,
 * upgrades and events. Each customer picks an item (weighted by popularity,
 * event and upgrade modifiers and price attractiveness), then buys it with a
 * probability that falls as the price rises above the fair reference price.
 * Stock-outs, service capacity and closed hours turn customers away.
 */
import {
  BASE_CONVERSION,
  BASE_FOOTFALL,
  CLOSE_HOUR,
  FOOTFALL_PER_REPUTATION,
  HOUR_WEIGHTS,
  MAX_CONVERSION,
  OPEN_HOUR,
  SERVICE_RATE_TARGET,
  SUBSTITUTE_ON_PRICE,
  SUBSTITUTE_ON_STOCKOUT,
  WEEKDAY_FACTORS,
  WEEKDAY_NAMES,
} from './constants';
import { INGREDIENTS } from './data/ingredients';
import { PRODUCTS } from './data/products';
import { PROMOTIONS, type PromotionDef } from './data/promotions';
import { UPGRADES } from './data/upgrades';
import { missingIngredient, recipeOf, takeFromStock } from './economy';
import type { ResolvedEvent } from './events';
import { applyBps } from './money';
import type { Rng } from './rng';
import { hourlyCapacity } from './staff';
import type {
  CustomerSummary,
  GameState,
  HourlyLine,
  IngredientId,
  IngredientState,
  ProductId,
  ProductState,
  StaffMember,
  TimelineEntry,
  UpgradeId,
} from './types';
import { INGREDIENT_IDS, PRODUCT_IDS } from './types';

/** Event effects that only apply from the hour the event happens (forecast events start at opening). */
export interface EventModifiers {
  fromHour: number;
  footfallMultiplier: number;
  capacityMultiplier: number;
  productDemand: Record<ProductId, number>;
}

export interface DemandModifiers {
  /** All-day footfall multiplier (promotion and upgrades). */
  footfallMultiplier: number;
  conversionBonus: number;
  discountBps: number;
  /** All-day product demand multipliers (upgrades). */
  productDemand: Record<ProductId, number>;
  capacityMultiplier: number;
  closedHours: ReadonlySet<number>;
  event: EventModifiers | null;
}

export function weekdayIndex(day: number): number {
  return (((day - 1) % 7) + 7) % 7;
}

export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[weekdayIndex(day)] ?? '';
}

export function weekdayFactor(day: number): number {
  return WEEKDAY_FACTORS[weekdayIndex(day)] ?? 1;
}

export function buildModifiers(
  upgrades: readonly UpgradeId[],
  promotion: PromotionDef,
  event: ResolvedEvent | null,
): DemandModifiers {
  let footfall = promotion.trafficMultiplier;
  let conversion = promotion.conversionBonus;
  const productDemand = Object.fromEntries(PRODUCT_IDS.map((id) => [id, 1])) as Record<ProductId, number>;

  for (const id of upgrades) {
    const effects = UPGRADES[id].effects;
    footfall *= effects.trafficMultiplier ?? 1;
    conversion += effects.conversionBonus ?? 0;
    for (const pid of PRODUCT_IDS) productDemand[pid] *= effects.productDemand?.[pid] ?? 1;
  }

  const closedHours = new Set<number>();
  let eventMods: EventModifiers | null = null;
  if (event) {
    for (const h of event.effects.closedHours ?? []) closedHours.add(h);
    eventMods = {
      fromHour: event.def.hour,
      footfallMultiplier: event.effects.trafficMultiplier ?? 1,
      capacityMultiplier: event.effects.capacityMultiplier ?? 1,
      productDemand: Object.fromEntries(PRODUCT_IDS.map((id) => [id, event.effects.productDemand?.[id] ?? 1])) as Record<ProductId, number>,
    };
  }

  return {
    footfallMultiplier: footfall,
    conversionBonus: conversion,
    discountBps: promotion.discountBps,
    productDemand,
    capacityMultiplier: 1,
    closedHours,
    event: eventMods,
  };
}

/** Modifiers in effect during `hour`: event effects are folded in once the event has happened. */
export function modifiersAt(mods: DemandModifiers, hour: number): DemandModifiers {
  const e = mods.event;
  if (!e || hour < e.fromHour) return mods;
  const productDemand = { ...mods.productDemand };
  for (const id of PRODUCT_IDS) productDemand[id] *= e.productDemand[id];
  return {
    ...mods,
    footfallMultiplier: mods.footfallMultiplier * e.footfallMultiplier,
    capacityMultiplier: mods.capacityMultiplier * e.capacityMultiplier,
    productDemand,
    event: null,
  };
}

function baseFootfall(day: number, reputation: number): number {
  return (BASE_FOOTFALL + reputation * FOOTFALL_PER_REPUTATION) * weekdayFactor(day);
}

/** Expected arrivals during one opening hour. */
export function expectedHourlyFootfall(day: number, reputation: number, mods: DemandModifiers, hour: number): number {
  const weight = HOUR_WEIGHTS[hour - OPEN_HOUR] ?? 0;
  return baseFootfall(day, reputation) * weight * modifiersAt(mods, hour).footfallMultiplier;
}

/** Expected arrivals over the whole day. */
export function expectedFootfall(day: number, reputation: number, mods: DemandModifiers): number {
  return openHours().reduce((sum, h) => sum + expectedHourlyFootfall(day, reputation, mods, h), 0);
}

/** Price customers actually pay today (menu price minus any promotion discount). */
export function salePrice(product: ProductState, mods: DemandModifiers): number {
  return product.priceSen - applyBps(product.priceSen, mods.discountBps);
}

/** >1 when cheaper than the fair price, <1 when more expensive. */
export function priceAttractiveness(productId: ProductId, priceSen: number): number {
  const def = PRODUCTS[productId];
  if (priceSen <= 0) return 3;
  const ratio = def.referencePriceSen / priceSen;
  return Math.min(3, Math.max(0.02, Math.pow(ratio, def.elasticity)));
}

export function buyProbability(productId: ProductId, priceSen: number, mods: DemandModifiers): number {
  const p = (BASE_CONVERSION + mods.conversionBonus) * priceAttractiveness(productId, priceSen);
  return Math.min(MAX_CONVERSION, Math.max(0, p));
}

function choiceWeight(productId: ProductId, priceSen: number, mods: DemandModifiers): number {
  return PRODUCTS[productId].popularity * mods.productDemand[productId] * Math.sqrt(priceAttractiveness(productId, priceSen));
}

function addOnProbability(productId: ProductId, priceSen: number, mods: DemandModifiers): number {
  const def = PRODUCTS[productId];
  return Math.min(0.9, def.addOnRate * mods.productDemand[productId] * Math.min(1.2, priceAttractiveness(productId, priceSen)));
}

export function capacityForHour(hour: number, baseCapacity: number, mods: DemandModifiers): number {
  if (mods.closedHours.has(hour)) return 0;
  return Math.floor(baseCapacity * modifiersAt(mods, hour).capacityMultiplier);
}

export function openHours(): number[] {
  const hours: number[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) hours.push(h);
  return hours;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// ---------------------------------------------------------------------------
// Estimates (shown to the player during preparation)
// ---------------------------------------------------------------------------

export interface DemandEstimate {
  footfall: number;
  /** Expected arrivals in the busiest hour. */
  peakHourFootfall: number;
  dailyCapacity: number;
  perProduct: Record<ProductId, number>;
}

/** Expected units demanded per product, ignoring stock and capacity limits. */
export function estimateDemand(
  day: number,
  reputation: number,
  products: Record<ProductId, ProductState>,
  staff: readonly StaffMember[],
  upgrades: readonly UpgradeId[],
  mods: DemandModifiers,
): DemandEstimate {
  const enabled = PRODUCT_IDS.filter((id) => products[id].enabled);
  const perProduct = Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0])) as Record<ProductId, number>;
  let footfall = 0;
  let peakHourFootfall = 0;
  for (const hour of openHours()) {
    const hm = modifiersAt(mods, hour);
    const arrivals = expectedHourlyFootfall(day, reputation, mods, hour);
    footfall += arrivals;
    peakHourFootfall = Math.max(peakHourFootfall, arrivals);
    const weights = enabled.map((id) => choiceWeight(id, salePrice(products[id], hm), hm));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) continue;
    let drinkUnits = 0;
    enabled.forEach((id, i) => {
      const share = (weights[i] ?? 0) / totalWeight;
      const units = arrivals * share * buyProbability(id, salePrice(products[id], hm), hm);
      perProduct[id] += units;
      if (PRODUCTS[id].kind !== 'food') drinkUnits += units;
    });
    // Food add-ons bought alongside drinks.
    for (const id of enabled) {
      if (PRODUCTS[id].addOnRate > 0) perProduct[id] += drinkUnits * addOnProbability(id, salePrice(products[id], hm), hm);
    }
  }
  const base = hourlyCapacity(staff, upgrades);
  const dailyCapacity = openHours().reduce((sum, h) => sum + capacityForHour(h, base, mods), 0);
  for (const id of PRODUCT_IDS) perProduct[id] = Math.round(perProduct[id]);
  return { footfall: Math.round(footfall), peakHourFootfall: Math.round(peakHourFootfall), dailyCapacity, perProduct };
}

// ---------------------------------------------------------------------------
// Day simulation
// ---------------------------------------------------------------------------

export interface SimulationInput {
  day: number;
  reputation: number;
  /** Prices and menu (stock is held per ingredient). */
  products: Record<ProductId, ProductState>;
  ingredients: Record<IngredientId, IngredientState>;
  baseHourlyCapacity: number;
  mods: DemandModifiers;
  extraOrders?: { hour: number; items: Partial<Record<ProductId, number>> };
}

export interface ProductSimLine {
  demanded: number;
  sold: number;
  unmetStockout: number;
  revenueSen: number;
  cogsSen: number;
  salePriceSen: number;
}

export interface SimulationOutput {
  ingredients: Record<IngredientId, IngredientState>;
  /** Ingredient units used by the products sold, and their carrying value (the day's COGS). */
  used: Record<IngredientId, { units: number; valueSen: number }>;
  lines: Record<ProductId, ProductSimLine>;
  hourly: HourlyLine[];
  customers: CustomerSummary;
  timeline: TimelineEntry[];
  /** Weighted average of (sale price / fair price) over units sold; 1 = fair. */
  priceIndex: number;
  extraOrder: { requested: number; fulfilled: number } | null;
}

export function simulateDay(input: SimulationInput, rng: Rng): SimulationOutput {
  const { mods, products } = input;
  const ingredients = { ...input.ingredients };
  const used = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, { units: 0, valueSen: 0 }])) as SimulationOutput['used'];
  const canMake = (id: ProductId): boolean => missingIngredient(ingredients, id) === null;
  const lines = Object.fromEntries(
    PRODUCT_IDS.map((id) => [
      id,
      { demanded: 0, sold: 0, unmetStockout: 0, revenueSen: 0, cogsSen: 0, salePriceSen: salePrice(products[id], mods) },
    ]),
  ) as Record<ProductId, ProductSimLine>;
  const timeline: TimelineEntry[] = [];
  const hourly: HourlyLine[] = [];
  const enabled = PRODUCT_IDS.filter((id) => products[id].enabled);
  const drinks = enabled.filter((id) => PRODUCTS[id].kind !== 'food');
  const addOns = enabled.filter((id) => PRODUCTS[id].addOnRate > 0);
  const soldOutAnnounced = new Set<ProductId>();
  let extraOrder: SimulationOutput['extraOrder'] = null;

  const ingredientName = (id: IngredientId): string => INGREDIENTS[id].name.toLowerCase();
  for (const id of enabled) {
    const missing = missingIngredient(ingredients, id);
    if (missing) {
      soldOutAnnounced.add(id);
      timeline.push({ hour: OPEN_HOUR, tone: 'bad', text: `${PRODUCTS[id].name} tidak boleh dibuat sejak pagi — ${ingredientName(missing)} tidak cukup.` });
    }
  }

  const sell = (id: ProductId, hour: number, line: HourlyLine): void => {
    let costSen = 0;
    for (const [ingredient, qty] of recipeOf(id)) {
      const taken = takeFromStock(ingredients[ingredient], qty);
      ingredients[ingredient] = taken.item;
      used[ingredient].units += qty;
      used[ingredient].valueSen += taken.costSen;
      costSen += taken.costSen;
    }
    const l = lines[id];
    l.sold += 1;
    l.revenueSen += l.salePriceSen;
    l.cogsSen += costSen;
    line.revenueSen += l.salePriceSen;
    // A shared ingredient running out can stop other products too.
    for (const other of enabled) {
      if (soldOutAnnounced.has(other)) continue;
      const missing = missingIngredient(ingredients, other);
      if (!missing) continue;
      soldOutAnnounced.add(other);
      timeline.push({ hour, tone: 'warn', text: `${PRODUCTS[other].name} habis — ${ingredientName(missing)} tidak cukup.` });
    }
  };

  const pickAlternative = (exclude: ProductId, hm: DemandModifiers): ProductId | undefined =>
    rng.weighted(
      enabled.filter((id) => id !== exclude && canMake(id)),
      (id) => choiceWeight(id, lines[id].salePriceSen, hm),
    );

  let busiest = { hour: OPEN_HOUR, served: -1 };

  for (const hour of openHours()) {
    // Event effects (traffic, capacity, product mix) only apply once the event has happened.
    const hm = modifiersAt(mods, hour);
    const expected = expectedHourlyFootfall(input.day, input.reputation, mods, hour);
    const arrivals = Math.max(0, Math.round(expected * (0.85 + rng.next() * 0.3)));
    const capacity = capacityForHour(hour, input.baseHourlyCapacity, mods);
    const line: HourlyLine = {
      hour,
      arrivals,
      served: 0,
      lostCapacity: 0,
      lostStock: 0,
      lostPrice: 0,
      lostClosed: 0,
      capacity,
      revenueSen: 0,
    };

    if (input.extraOrders && input.extraOrders.hour === hour) {
      let requested = 0;
      let fulfilled = 0;
      for (const id of PRODUCT_IDS) {
        const qty = input.extraOrders.items[id] ?? 0;
        if (qty <= 0) continue;
        requested += qty;
        lines[id].demanded += qty;
        let made = 0;
        while (made < qty && products[id].enabled && canMake(id)) {
          sell(id, hour, line);
          made += 1;
        }
        fulfilled += made;
        lines[id].unmetStockout += qty - made;
      }
      extraOrder = { requested, fulfilled };
    }

    for (let c = 0; c < arrivals; c++) {
      if (capacity === 0) {
        line.lostClosed += 1;
        continue;
      }
      if (line.served >= capacity) {
        line.lostCapacity += 1;
        continue;
      }
      const desired = rng.weighted(enabled, (id) => choiceWeight(id, lines[id].salePriceSen, hm));
      if (!desired) {
        // Nothing on the menu at all.
        line.lostStock += 1;
        continue;
      }
      lines[desired].demanded += 1;
      let bought: ProductId | undefined;

      if (!canMake(desired)) {
        lines[desired].unmetStockout += 1;
        if (rng.chance(SUBSTITUTE_ON_STOCKOUT)) {
          const alt = pickAlternative(desired, hm);
          if (alt && rng.chance(buyProbability(alt, lines[alt].salePriceSen, hm))) bought = alt;
        }
        if (!bought) {
          line.lostStock += 1;
          continue;
        }
      } else if (rng.chance(buyProbability(desired, lines[desired].salePriceSen, hm))) {
        bought = desired;
      } else {
        if (rng.chance(SUBSTITUTE_ON_PRICE)) {
          const alt = pickAlternative(desired, hm);
          if (alt && rng.chance(buyProbability(alt, lines[alt].salePriceSen, hm))) bought = alt;
        }
        if (!bought) {
          line.lostPrice += 1;
          continue;
        }
      }

      sell(bought, hour, line);
      line.served += 1;

      if (drinks.includes(bought)) {
        for (const addOn of addOns) {
          if (addOn === bought) continue;
          if (!rng.chance(addOnProbability(addOn, lines[addOn].salePriceSen, hm))) continue;
          lines[addOn].demanded += 1;
          if (canMake(addOn)) sell(addOn, hour, line);
          else lines[addOn].unmetStockout += 1;
        }
      }
    }

    if (line.lostCapacity >= 3) {
      timeline.push({ hour, tone: 'warn', text: `Barisan terlalu panjang — ${line.lostCapacity} pelanggan beredar.` });
    }
    if (line.served > busiest.served) busiest = { hour, served: line.served };
    hourly.push(line);
  }

  if (busiest.served > 0) {
    timeline.push({
      hour: CLOSE_HOUR,
      tone: 'good',
      text: `Waktu paling sibuk ialah ${formatHour(busiest.hour)} dengan ${busiest.served} pesanan.`,
    });
  }

  const sum = (key: keyof Omit<HourlyLine, 'hour'>): number => hourly.reduce((acc, h) => acc + h[key], 0);
  const served = sum('served');
  const lostCapacity = sum('lostCapacity');
  const lostStock = sum('lostStock');
  const lostClosed = sum('lostClosed');
  const willing = served + lostCapacity + lostStock + lostClosed;
  const customers: CustomerSummary = {
    arrivals: sum('arrivals'),
    served,
    lostCapacity,
    lostStock,
    lostPrice: sum('lostPrice'),
    lostClosed,
    serviceRate: willing === 0 ? 1 : served / willing,
  };

  let priceWeighted = 0;
  let unitsSold = 0;
  for (const id of PRODUCT_IDS) {
    const l = lines[id];
    priceWeighted += l.sold * (l.salePriceSen / PRODUCTS[id].referencePriceSen);
    unitsSold += l.sold;
  }
  let priceIndex = 1;
  if (unitsSold > 0) priceIndex = priceWeighted / unitsSold;
  else if (enabled.length > 0)
    priceIndex = enabled.reduce((a, id) => a + lines[id].salePriceSen / PRODUCTS[id].referencePriceSen, 0) / enabled.length;

  return { ingredients, used, lines, hourly, customers, timeline, priceIndex, extraOrder };
}

// ---------------------------------------------------------------------------
// Reputation
// ---------------------------------------------------------------------------

/**
 * Whole percent for display (0.896 -> 89). Rounds down, with a tiny epsilon so floating-point
 * results such as 0.29 * 100 = 28.999… still read 29, so a threshold is never shown as met early.
 */
export function percentPoints(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-9);
}

/** Whole reputation points for display. Rounds down so it never shows a milestone not yet reached. */
export function reputationPoints(reputation: number): number {
  return Math.floor(reputation + 1e-9);
}

export interface ReputationInput {
  reputation: number;
  customers: CustomerSummary;
  priceIndex: number;
  upgrades: readonly UpgradeId[];
  promotionDelta: number;
  eventDelta: number;
}

export function reputationChange(input: ReputationInput): { delta: number; after: number } {
  const { customers } = input;
  let organic = 0;
  const willing = customers.served + customers.lostCapacity + customers.lostStock + customers.lostClosed;
  if (willing > 0) {
    organic += Math.max(-5, Math.min(2, (customers.serviceRate - SERVICE_RATE_TARGET) * 12));
  } else {
    organic -= 3; // opened with nothing customers could buy
  }
  if (input.priceIndex > 1.1) organic -= Math.min(4, (input.priceIndex - 1.1) * 12);
  else if (input.priceIndex < 0.92) organic += 0.4;
  for (const id of input.upgrades) organic += UPGRADES[id].effects.reputationPerDay ?? 0;

  // Growth gets harder near the top of the scale.
  if (organic > 0) organic *= Math.max(0.2, 1 - Math.max(0, input.reputation - 60) / 45);

  const delta = organic + input.promotionDelta + input.eventDelta;
  const after = Math.min(100, Math.max(0, Math.round((input.reputation + delta) * 10) / 10));
  return { delta: Math.round((after - input.reputation) * 10) / 10, after };
}

/** Convenience: modifiers for the current state's preparation (today's event and promotion). */
export function modifiersForState(state: GameState, event: ResolvedEvent | null): DemandModifiers {
  return buildModifiers(state.upgrades, PROMOTIONS[state.promotion], event);
}
