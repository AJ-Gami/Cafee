import { MAX_PURCHASE_QTY } from '../constants';
import { PRODUCTS } from '../data/products';
import { createNewGame, openCafe, purchaseStockBatch, startNextDay } from '../engine';
import { migrateSave } from '../save';
import type { DayReport, EngineResult, GameState, IngredientId, ProductId } from '../types';
import { INGREDIENT_IDS, PRODUCT_IDS } from '../types';

export const TEST_SEED = 12345;

export function newGame(seed = TEST_SEED): GameState {
  return createNewGame(seed);
}

export function expectOk(result: EngineResult): Extract<EngineResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}: ${result.message}`);
  return result;
}

export function expectFail(result: EngineResult): Extract<EngineResult, { ok: false }> {
  if (result.ok) throw new Error(`Expected failure, got ok: ${result.message}`);
  return result;
}

/** Ingredient units needed to make `qty` of every product. */
export function ingredientsFor(qty: number): Record<IngredientId, number> {
  const need = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])) as Record<IngredientId, number>;
  for (const p of PRODUCT_IDS) for (const id of INGREDIENT_IDS) need[id] += qty * (PRODUCTS[p].recipe[id] ?? 0);
  return need;
}

/** Purchase lines for the given units (split to respect the per-line limit). */
export function purchaseLines(units: Partial<Record<IngredientId, number>>): { ingredientId: IngredientId; quantity: number }[] {
  return INGREDIENT_IDS.flatMap((ingredientId) => {
    const lines: { ingredientId: IngredientId; quantity: number }[] = [];
    for (let left = units[ingredientId] ?? 0; left > 0; left -= MAX_PURCHASE_QTY) {
      lines.push({ ingredientId, quantity: Math.min(left, MAX_PURCHASE_QTY) });
    }
    return lines;
  });
}

/** Buy enough ingredients to make `qty` more of every product. */
export function stockAll(state: GameState, qty = 60): GameState {
  return expectOk(purchaseStockBatch(state, purchaseLines(ingredientsFor(qty)))).state;
}

/** Replace the current day's event (for deterministic event tests). */
export function withEvent(state: GameState, eventId: GameState['todayEventId']): GameState {
  return { ...state, todayEventId: eventId };
}

export function settle(state: GameState): { state: GameState; report: DayReport } {
  const result = expectOk(openCafe(state, state.day));
  if (!result.report) throw new Error('missing report');
  return { state: result.state, report: result.report };
}

/** Run n full days with a simple restocking strategy. */
export function playDays(state: GameState, days: number, qty = 40): { state: GameState; reports: DayReport[] } {
  let s = state;
  const reports: DayReport[] = [];
  for (let i = 0; i < days; i++) {
    const need = ingredientsFor(qty);
    const topUp = purchaseLines(
      Object.fromEntries(INGREDIENT_IDS.map((id) => [id, Math.max(0, need[id] - s.ingredients[id].stock)])) as Record<IngredientId, number>,
    );
    if (topUp.length > 0) {
      const bought = purchaseStockBatch(s, topUp);
      if (bought.ok) s = bought.state;
    }
    const day = settle(s);
    reports.push(day.report);
    s = day.state;
    if (s.status !== 'active') break;
    s = expectOk(startNextDay(s, s.day)).state;
  }
  return { state: s, reports };
}

export function soldOf(report: DayReport, id: ProductId): number {
  return report.products.find((l) => l.productId === id)?.sold ?? 0;
}

/** Older saves are plain JSON of another shape. */
type Loose = Record<string, any>;

/** Which product an ingredient's stock and spoilage are credited to in a pre-ingredient save. */
const LEGACY_PRODUCT: Record<IngredientId, ProductId> = { kopi: 'kopi_o', susu: 'teh_ais', teh: 'teh_ais', pastri: 'croissant' };

/**
 * `game` (cloned) in the shape saves had before ingredient stock (schema v5 and older): stock held
 * per product, reports with per-product spoilage and closing stock, purchases naming a product.
 * Units are approximate (milk and tea become teh ais) but the inventory value is kept exactly.
 */
export function withProductStock(game: GameState): Loose {
  const g = structuredClone(game) as unknown as Loose;
  const ing = game.ingredients;
  if ((ing.susu.stockValueSen > 0 || ing.teh.stockValueSen > 0) && Math.min(ing.susu.stock, ing.teh.stock) === 0) {
    throw new Error('withProductStock: milk and tea must both be in stock to become teh ais');
  }
  delete g.ingredients;
  for (const id of PRODUCT_IDS) g.products[id] = { ...g.products[id], unitCostSen: 100, stock: 0, stockValueSen: 0 };
  g.products.kopi_o = { ...g.products.kopi_o, stock: ing.kopi.stock, stockValueSen: ing.kopi.stockValueSen };
  g.products.teh_ais = { ...g.products.teh_ais, stock: Math.min(ing.susu.stock, ing.teh.stock), stockValueSen: ing.susu.stockValueSen + ing.teh.stockValueSen };
  g.products.croissant = { ...g.products.croissant, stock: ing.pastri.stock, stockValueSen: ing.pastri.stockValueSen };
  const legacyTx = (t: Loose): void => {
    if (!t.ingredientId) return;
    t.productId = LEGACY_PRODUCT[t.ingredientId as IngredientId];
    delete t.ingredientId;
  };
  (g.dayTransactions as Loose[]).forEach(legacyTx);
  for (const r of g.history as Loose[]) {
    (r.transactions as Loose[]).forEach(legacyTx);
    if (!r.ingredients) continue; // already a pre-ingredient report
    for (const line of r.products as Loose[]) Object.assign(line, { spoiledUnits: 0, spoiledValueSen: 0, closingStock: 0 });
    for (const l of r.ingredients as Loose[]) {
      const line = (r.products as Loose[]).find((p) => p.productId === LEGACY_PRODUCT[l.ingredientId as IngredientId]);
      if (!line) continue;
      line.spoiledUnits += l.spoiled;
      line.spoiledValueSen += l.spoiledValueSen;
    }
    delete r.ingredients;
  }
  return g;
}

/** `game` after a trip through the last pre-ingredient save format: what any older save of it loads as. */
export function viaProductStock(game: GameState): GameState {
  const migrated = migrateSave({ schemaVersion: 5, savedAt: 'x', game: { ...withProductStock(game), schemaVersion: 5 } });
  if (!migrated.ok) throw new Error(migrated.error);
  return migrated.game as GameState;
}
