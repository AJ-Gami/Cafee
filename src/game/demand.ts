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
import { PRODUCTS } from './data/products';
import { PROMOTIONS, type PromotionDef } from './data/promotions';
import { UPGRADES } from './data/upgrades';
import { takeFromStock } from './economy';
import type { ResolvedEvent } from './events';
import { applyBps } from './money';
import type { Rng } from './rng';
import { hourlyCapacity } from './staff';
import type {
  CustomerSummary,
  GameState,
  HourlyLine,
  ProductId,
  ProductState,
  StaffMember,
  TimelineEntry,
  UpgradeId,
} from './types';
import { PRODUCT_IDS } from './types';

export interface DemandModifiers {
  footfallMultiplier: number;
  conversionBonus: number;
  discountBps: number;
  productDemand: Record<ProductId, number>;
  capacityMultiplier: number;
  closedHours: ReadonlySet<number>;
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

  let capacityMultiplier = 1;
  const closedHours = new Set<number>();
  if (event) {
    footfall *= event.effects.trafficMultiplier ?? 1;
    capacityMultiplier *= event.effects.capacityMultiplier ?? 1;
    for (const pid of PRODUCT_IDS) productDemand[pid] *= event.effects.productDemand?.[pid] ?? 1;
    for (const h of event.effects.closedHours ?? []) closedHours.add(h);
  }

  return {
    footfallMultiplier: footfall,
    conversionBonus: conversion,
    discountBps: promotion.discountBps,
    productDemand,
    capacityMultiplier,
    closedHours,
  };
}

export function expectedFootfall(day: number, reputation: number, mods: DemandModifiers): number {
  return (BASE_FOOTFALL + reputation * FOOTFALL_PER_REPUTATION) * weekdayFactor(day) * mods.footfallMultiplier;
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
  return Math.floor(baseCapacity * mods.capacityMultiplier);
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
  const footfall = expectedFootfall(day, reputation, mods);
  const enabled = PRODUCT_IDS.filter((id) => products[id].enabled);
  const perProduct = Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0])) as Record<ProductId, number>;
  const weights = enabled.map((id) => choiceWeight(id, salePrice(products[id], mods), mods));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    enabled.forEach((id, i) => {
      const share = (weights[i] ?? 0) / totalWeight;
      perProduct[id] += footfall * share * buyProbability(id, salePrice(products[id], mods), mods);
    });
    // Food add-ons bought alongside drinks.
    const drinkUnits = enabled.filter((id) => PRODUCTS[id].kind !== 'food').reduce((sum, id) => sum + perProduct[id], 0);
    for (const id of enabled) {
      if (PRODUCTS[id].addOnRate > 0) perProduct[id] += drinkUnits * addOnProbability(id, salePrice(products[id], mods), mods);
    }
  }
  const base = hourlyCapacity(staff, upgrades);
  const dailyCapacity = openHours().reduce((sum, h) => sum + capacityForHour(h, base, mods), 0);
  for (const id of PRODUCT_IDS) perProduct[id] = Math.round(perProduct[id]);
  const peakHourFootfall = Math.round(footfall * Math.max(...HOUR_WEIGHTS));
  return { footfall: Math.round(footfall), peakHourFootfall, dailyCapacity, perProduct };
}

// ---------------------------------------------------------------------------
// Day simulation
// ---------------------------------------------------------------------------

export interface SimulationInput {
  day: number;
  reputation: number;
  products: Record<ProductId, ProductState>;
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
  products: Record<ProductId, ProductState>;
  lines: Record<ProductId, ProductSimLine>;
  hourly: HourlyLine[];
  customers: CustomerSummary;
  timeline: TimelineEntry[];
  /** Weighted average of (sale price / fair price) over units sold; 1 = fair. */
  priceIndex: number;
  extraOrder: { requested: number; fulfilled: number } | null;
}

export function simulateDay(input: SimulationInput, rng: Rng): SimulationOutput {
  const { mods } = input;
  const products = { ...input.products };
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

  for (const id of enabled) {
    if (products[id].stock === 0) {
      soldOutAnnounced.add(id);
      timeline.push({ hour: OPEN_HOUR, tone: 'bad', text: `${PRODUCTS[id].name} tiada stok sejak pagi.` });
    }
  }

  const sell = (id: ProductId, hour: number, line: HourlyLine): void => {
    const taken = takeFromStock(products[id], 1);
    products[id] = taken.product;
    const l = lines[id];
    l.sold += 1;
    l.revenueSen += l.salePriceSen;
    l.cogsSen += taken.costSen;
    line.revenueSen += l.salePriceSen;
    if (products[id].stock === 0 && !soldOutAnnounced.has(id)) {
      soldOutAnnounced.add(id);
      timeline.push({ hour, tone: 'warn', text: `${PRODUCTS[id].name} habis dijual.` });
    }
  };

  const pickAlternative = (exclude: ProductId): ProductId | undefined =>
    rng.weighted(
      enabled.filter((id) => id !== exclude && products[id].stock > 0),
      (id) => choiceWeight(id, lines[id].salePriceSen, mods),
    );

  const footfall = expectedFootfall(input.day, input.reputation, mods);
  let busiest = { hour: OPEN_HOUR, served: -1 };

  HOUR_WEIGHTS.forEach((weight, index) => {
    const hour = OPEN_HOUR + index;
    const arrivals = Math.max(0, Math.round(footfall * weight * (0.85 + rng.next() * 0.3)));
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
        const available = products[id].enabled ? Math.min(qty, products[id].stock) : 0;
        for (let i = 0; i < available; i++) sell(id, hour, line);
        fulfilled += available;
        lines[id].unmetStockout += qty - available;
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
      const desired = rng.weighted(enabled, (id) => choiceWeight(id, lines[id].salePriceSen, mods));
      if (!desired) {
        // Nothing on the menu at all.
        line.lostStock += 1;
        continue;
      }
      lines[desired].demanded += 1;
      let bought: ProductId | undefined;

      if (products[desired].stock === 0) {
        lines[desired].unmetStockout += 1;
        if (rng.chance(SUBSTITUTE_ON_STOCKOUT)) {
          const alt = pickAlternative(desired);
          if (alt && rng.chance(buyProbability(alt, lines[alt].salePriceSen, mods))) bought = alt;
        }
        if (!bought) {
          line.lostStock += 1;
          continue;
        }
      } else if (rng.chance(buyProbability(desired, lines[desired].salePriceSen, mods))) {
        bought = desired;
      } else {
        if (rng.chance(SUBSTITUTE_ON_PRICE)) {
          const alt = pickAlternative(desired);
          if (alt && rng.chance(buyProbability(alt, lines[alt].salePriceSen, mods))) bought = alt;
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
          if (!rng.chance(addOnProbability(addOn, lines[addOn].salePriceSen, mods))) continue;
          lines[addOn].demanded += 1;
          if (products[addOn].stock > 0) sell(addOn, hour, line);
          else lines[addOn].unmetStockout += 1;
        }
      }
    }

    if (line.lostCapacity >= 3) {
      timeline.push({ hour, tone: 'warn', text: `Barisan terlalu panjang — ${line.lostCapacity} pelanggan beredar.` });
    }
    if (line.served > busiest.served) busiest = { hour, served: line.served };
    hourly.push(line);
  });

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

  return { products, lines, hourly, customers, timeline, priceIndex, extraOrder };
}

// ---------------------------------------------------------------------------
// Reputation
// ---------------------------------------------------------------------------

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
