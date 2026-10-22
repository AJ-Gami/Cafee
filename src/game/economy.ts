/**
 * Economy calculations: inventory costing, purchase quotes, recipes and
 * operating expenses. Ingredients are held at weighted-average cost: purchases
 * add to the carrying value, and the value only becomes cost of goods sold
 * (COGS) when a product made from them is sold (or is written off as spoilage).
 */
import {
  BULK_DISCOUNTS,
  RENT_SEN_PER_DAY,
  UTILITIES_BASE_SEN,
  UTILITIES_PER_CUSTOMER_SEN,
} from './constants';
import { INGREDIENTS } from './data/ingredients';
import { PRODUCTS } from './data/products';
import { UPGRADES } from './data/upgrades';
import { resolveEvent } from './events';
import { installmentDue } from './loans';
import { applyBps, mulDivRound, sumSen } from './money';
import type { GameState, IngredientId, IngredientState, ProductId, StaffMember, UpgradeId } from './types';
import { INGREDIENT_IDS } from './types';

export interface PurchaseQuote {
  ingredientId: IngredientId;
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
export function todaysUnitCost(state: GameState, ingredientId: IngredientId): { unitCostSen: number; surchargeBps: number } {
  const base = state.ingredients[ingredientId].unitCostSen;
  const event = resolveEvent(state.todayEventId, state.upgrades);
  const surchargeBps = event?.effects.purchaseCostBps?.[ingredientId] ?? 10_000;
  return { unitCostSen: applyBps(base, surchargeBps), surchargeBps };
}

export function quotePurchase(state: GameState, ingredientId: IngredientId, quantity: number): PurchaseQuote {
  const { unitCostSen, surchargeBps } = todaysUnitCost(state, ingredientId);
  const qty = Math.max(0, Math.floor(quantity));
  const subtotalSen = unitCostSen * qty;
  const discountBps = bulkDiscountBps(qty);
  const discountSen = applyBps(subtotalSen, discountBps);
  return {
    ingredientId,
    quantity: qty,
    unitCostSen,
    subtotalSen,
    discountBps,
    discountSen,
    totalSen: subtotalSen - discountSen,
    surchargeBps,
  };
}

/** Anything held at weighted-average cost. */
interface Stocked {
  stock: number;
  stockValueSen: number;
}

export function addToStock<T extends Stocked>(item: T, quantity: number, totalCostSen: number): T {
  return { ...item, stock: item.stock + quantity, stockValueSen: item.stockValueSen + totalCostSen };
}

/**
 * Remove units at weighted-average cost. When the last unit leaves, the full
 * remaining value is released so no rounding residue is ever left behind.
 */
export function takeFromStock<T extends Stocked>(item: T, quantity: number): { item: T; costSen: number } {
  const units = Math.min(Math.max(0, Math.floor(quantity)), item.stock);
  if (units === 0) return { item, costSen: 0 };
  const costSen = units === item.stock ? item.stockValueSen : mulDivRound(item.stockValueSen, units, item.stock);
  return { item: { ...item, stock: item.stock - units, stockValueSen: item.stockValueSen - costSen }, costSen };
}

export function averageUnitCost(item: Stocked): number {
  if (item.stock <= 0) return 0;
  return mulDivRound(item.stockValueSen, 1, item.stock);
}

export function inventoryValue(ingredients: Record<IngredientId, IngredientState>): number {
  return sumSen(INGREDIENT_IDS.map((id) => ingredients[id].stockValueSen));
}

/** The ingredients one unit of a product uses, as [ingredient, units] pairs. */
export function recipeOf(productId: ProductId): [IngredientId, number][] {
  return INGREDIENT_IDS.flatMap((id) => {
    const qty = PRODUCTS[productId].recipe[id] ?? 0;
    return qty > 0 ? [[id, qty] as [IngredientId, number]] : [];
  });
}

/** How many of a product the stock on hand can make (ignoring other products sharing it). */
export function servingsAvailable(ingredients: Record<IngredientId, IngredientState>, productId: ProductId): number {
  return Math.min(...recipeOf(productId).map(([id, qty]) => Math.floor(ingredients[id].stock / qty)));
}

/** The ingredient that runs out first for a product, if its stock cannot make one more. */
export function missingIngredient(ingredients: Record<IngredientId, IngredientState>, productId: ProductId): IngredientId | null {
  return recipeOf(productId).find(([id, qty]) => ingredients[id].stock < qty)?.[0] ?? null;
}

/** Share of an ingredient's stock left at closing that spoils overnight (after upgrades). */
export function spoilageRate(ingredientId: IngredientId, upgrades: readonly UpgradeId[]): number {
  let rate = INGREDIENTS[ingredientId].spoilageRate;
  for (const id of upgrades) rate *= UPGRADES[id].effects.spoilageMultiplier?.[ingredientId] ?? 1;
  return rate;
}

/** Cost of one unit of a product at today's supplier prices (event surcharges included). */
export function recipeCostToday(state: GameState, productId: ProductId): { unitCostSen: number; surcharged: boolean } {
  let unitCostSen = 0;
  let surcharged = false;
  for (const [id, qty] of recipeOf(productId)) {
    const cost = todaysUnitCost(state, id);
    unitCostSen += cost.unitCostSen * qty;
    if (cost.surchargeBps !== 10_000) surcharged = true;
  }
  return { unitCostSen, surcharged };
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

/**
 * Fixed payments known before opening, all charged at today's close: wages, rent, base utilities
 * (excluding the per-customer part) and any loan installment due.
 */
export function projectedFixedCosts(state: GameState): {
  wagesSen: number;
  rentSen: number;
  utilitiesBaseSen: number;
  loanSen: number;
  totalSen: number;
} {
  const wagesSen = dailyWages(state.staff);
  const rentSen = dailyRent();
  const utilitiesBaseSen = dailyUtilities(state.upgrades, 0);
  const loanSen = installmentDue(state.loan, state.day)?.totalSen ?? 0;
  return { wagesSen, rentSen, utilitiesBaseSen, loanSen, totalSen: wagesSen + rentSen + utilitiesBaseSen + loanSen };
}
