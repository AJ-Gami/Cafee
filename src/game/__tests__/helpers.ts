import { createNewGame, openCafe, purchaseStockBatch, startNextDay } from '../engine';
import type { DayReport, EngineResult, GameState, ProductId } from '../types';
import { PRODUCT_IDS } from '../types';

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

/** Stock every product with `qty` units. */
export function stockAll(state: GameState, qty = 60): GameState {
  return expectOk(purchaseStockBatch(state, PRODUCT_IDS.map((productId) => ({ productId, quantity: qty })))).state;
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
    const topUp = PRODUCT_IDS.map((productId) => ({ productId, quantity: Math.max(0, qty - s.products[productId].stock) }))
      .filter((item) => item.quantity > 0);
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
