/**
 * Economy calculations: inventory costing, purchase quotes and operating
 * expenses. Inventory uses weighted-average cost: purchases add to the
 * carrying value, and the value only becomes cost of goods sold (COGS) when
 * units are actually sold (or written off as spoilage).
 */
import {
  BULK_DISCOUNTS,
  RENT_SEN_PER_DAY,
  UTILITIES_BASE_SEN,
  UTILITIES_PER_CUSTOMER_SEN,
} from './constants';
import { UPGRADES } from './data/upgrades';
import { resolveEvent } from './events';
import { applyBps, mulDivRound, sumSen } from './money';
import type { GameState, ProductId, ProductState, StaffMember, UpgradeId } from './types';
import { PRODUCT_IDS } from './types';

export interface PurchaseQuote {
  productId: ProductId;
  quantity: number;
  /** Supplier cost per unit today, including any event surcharge. */
  unitCostSen: number;
  subtotalSen: number;
  discountBps: number;
  discountSen: number;
  totalSen: number;
  /** Event surcharge in basis points (10000 = none). */
  surchargeBps: number;
}

/** A cost the café can pay right now. Free items are always affordable, even with negative cash. */
export function canAfford(costSen: number, cashSen: number): boolean {
  return costSen <= 0 || costSen <= cashSen;
}

export function bulkDiscountBps(quantity: number): number {
  for (const tier of BULK_DISCOUNTS) {
    if (quantity >= tier.minQty) return tier.bps;
  }
  return 0;
}

/** Supplier cost per unit for purchases made today. */
export function todaysUnitCost(state: GameState, productId: ProductId): { unitCostSen: number; surchargeBps: number } {
  const base = state.products[productId].unitCostSen;
  const event = resolveEvent(state.todayEventId, state.upgrades);
  const surchargeBps = event?.effects.purchaseCostBps?.[productId] ?? 10_000;
  return { unitCostSen: applyBps(base, surchargeBps), surchargeBps };
}

export function quotePurchase(state: GameState, productId: ProductId, quantity: number): PurchaseQuote {
  const { unitCostSen, surchargeBps } = todaysUnitCost(state, productId);
  const qty = Math.max(0, Math.floor(quantity));
  const subtotalSen = unitCostSen * qty;
  const discountBps = bulkDiscountBps(qty);
  const discountSen = applyBps(subtotalSen, discountBps);
  return {
    productId,
    quantity: qty,
    unitCostSen,
    subtotalSen,
    discountBps,
    discountSen,
    totalSen: subtotalSen - discountSen,
    surchargeBps,
  };
}

export function addToStock(product: ProductState, quantity: number, totalCostSen: number): ProductState {
  return {
    ...product,
    stock: product.stock + quantity,
    stockValueSen: product.stockValueSen + totalCostSen,
  };
}

/**
 * Remove units at weighted-average cost. When the last unit leaves, the full
 * remaining value is released so no rounding residue is ever left behind.
 */
export function takeFromStock(product: ProductState, quantity: number): { product: ProductState; costSen: number } {
  const units = Math.min(Math.max(0, Math.floor(quantity)), product.stock);
  if (units === 0) return { product, costSen: 0 };
  const costSen =
    units === product.stock ? product.stockValueSen : mulDivRound(product.stockValueSen, units, product.stock);
  return {
    product: { ...product, stock: product.stock - units, stockValueSen: product.stockValueSen - costSen },
    costSen,
  };
}

export function averageUnitCost(product: ProductState): number {
  if (product.stock <= 0) return 0;
  return mulDivRound(product.stockValueSen, 1, product.stock);
}

export function inventoryValue(products: Record<ProductId, ProductState>): number {
  return sumSen(PRODUCT_IDS.map((id) => products[id].stockValueSen));
}

export function dailyWages(staff: readonly StaffMember[]): number {
  return sumSen(staff.map((s) => s.wageSen));
}

export function dailyRent(): number {
  return RENT_SEN_PER_DAY;
}

export function dailyUtilities(upgrades: readonly UpgradeId[], customersServed: number): number {
  const extra = sumSen(upgrades.map((id) => UPGRADES[id].effects.utilitiesSenPerDay ?? 0));
  return UTILITIES_BASE_SEN + extra + UTILITIES_PER_CUSTOMER_SEN * Math.max(0, customersServed);
}

/** Fixed daily running costs known before opening (utilities exclude the per-customer part). */
export function projectedFixedCosts(state: GameState): { wagesSen: number; rentSen: number; utilitiesBaseSen: number; totalSen: number } {
  const wagesSen = dailyWages(state.staff);
  const rentSen = dailyRent();
  const utilitiesBaseSen = dailyUtilities(state.upgrades, 0);
  return { wagesSen, rentSen, utilitiesBaseSen, totalSen: wagesSen + rentSen + utilitiesBaseSen };
}
