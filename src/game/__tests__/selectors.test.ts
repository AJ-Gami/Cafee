import { describe, expect, it } from 'vitest';
import { purchaseStockBatch, setProductEnabled, setPromotion } from '../engine';
import { formatRMCompact } from '../money';
import { cumulativeByHour, historySeries } from '../reports';
import { percentPoints, reputationPoints } from '../demand';
import {
  capacityAfterHire,
  dayEstimate,
  hiringCandidates,
  ingredientViews,
  objectiveViews,
  prepChecklist,
  previewPrice,
  pricePerception,
  productViews,
  restockPlan,
  visibleTodayEvent,
} from '../selectors';
import { expectOk, newGame, playDays, settle, stockAll, withEvent } from './helpers';

describe('selectors', () => {
  it('flags out-of-stock products and suggests a restock the player can afford', () => {
    const s = newGame();
    expect(productViews(s).every((v) => v.stockLevel === 'out' && v.servings === 0)).toBe(true);
    expect(ingredientViews(s).every((v) => v.stockLevel === 'out')).toBe(true);
    const plan = restockPlan(s);
    expect(plan.items.map((i) => i.ingredientId)).toEqual(['kopi', 'susu', 'teh', 'pastri']);
    expect(plan.totalSen).toBeGreaterThan(0);
    expect(plan.totalSen).toBeLessThan(s.cashSen);
    expect(prepChecklist(s).find((c) => c.id === 'stock')?.status).toBe('bad');
    // Buying the plan covers today's estimate for every product.
    const restocked = expectOk(purchaseStockBatch(s, plan.items)).state;
    expect(productViews(restocked).every((v) => v.stockLevel === 'ok')).toBe(true);
    expect(restockPlan(restocked).items).toHaveLength(0);
    expect(prepChecklist(restocked).find((c) => c.id === 'stock')?.status).toBe('ok');
  });

  it('works out each ingredient’s need from every product that uses it', () => {
    const s = newGame();
    const est = dayEstimate(s).perProduct;
    const milk = ingredientViews(s).find((v) => v.id === 'susu');
    expect(milk?.estimatedNeed).toBe(est.latte * 2 + est.teh_ais);
    expect(milk?.usedBy.map((u) => [u.productId, u.qty])).toEqual([
      ['latte', 2],
      ['teh_ais', 1],
    ]);
    expect(milk?.spoilageRate).toBe(0.05);
    // Without teh ais on the menu, milk is only needed for lattes; tea is not needed at all.
    const noTea = expectOk(setProductEnabled(s, 'teh_ais', false)).state;
    const est2 = dayEstimate(noTea).perProduct;
    expect(ingredientViews(noTea).find((v) => v.id === 'susu')?.estimatedNeed).toBe(est2.latte * 2);
    expect(ingredientViews(noTea).find((v) => v.id === 'teh')).toMatchObject({ stockLevel: 'off', suggestedPurchase: 0 });
    // Milk shared by two products: enough for either alone is not enough for both.
    const someMilk = expectOk(purchaseStockBatch(stockAll(s, 40), [{ ingredientId: 'teh', quantity: 1 }])).state;
    const tight = { ...someMilk, ingredients: { ...someMilk.ingredients, susu: { ...someMilk.ingredients.susu, stock: est.latte * 2 } } };
    expect(productViews(tight).find((v) => v.id === 'latte')?.stockLevel).toBe('low');
    expect(productViews(tight).find((v) => v.id === 'teh_ais')?.stockLevel).toBe('low');
  });

  it('does not leak surprise events into the forecast', () => {
    const base = dayEstimate(newGame());
    expect(dayEstimate(withEvent(newGame(), 'viral_post')).footfall).toBe(base.footfall);
    expect(visibleTodayEvent(withEvent(newGame(), 'viral_post'))).toBeNull();
    expect(dayEstimate(withEvent(newGame(), 'food_festival')).footfall).toBeGreaterThan(base.footfall);
  });

  it('reveals the event once the day is settled', () => {
    const { state } = settle(withEvent(stockAll(newGame()), 'viral_post'));
    expect(visibleTodayEvent(state)?.title).toBeTruthy();
  });

  it('previews margin and perception for a draft price including promotions', () => {
    const s = newGame();
    const p = previewPrice(s, 'latte', 900);
    expect(p.marginSen).toBe(680);
    expect(p.perception).toBe('pricey');
    expect(pricePerception('latte', 600)).toBe('cheap');
    expect(pricePerception('latte', 700)).toBe('fair');
    expect(pricePerception('latte', 1_000)).toBe('too_expensive');
    const discounted = previewPrice(expectOk(setPromotion(s, 'discount10')).state, 'latte', 700);
    expect(discounted.salePriceSen).toBe(630);
    expect(discounted.marginSen).toBe(410);
  });

  it('builds chart series and hourly running totals from reports', () => {
    const { state, reports } = playDays(newGame(), 3);
    const series = historySeries(state.history, 14);
    expect(series.map((p) => p.day)).toEqual([1, 2, 3]);
    const report = reports[0];
    if (!report) throw new Error('missing report');
    const cumulative = cumulativeByHour(report);
    expect(cumulative).toHaveLength(12);
    expect(cumulative[cumulative.length - 1]?.revenueSen).toBe(report.revenueSen);
    expect(cumulative[cumulative.length - 1]?.served).toBe(report.customers.served);
  });

  it('reports the real capacity gain of a hire, including upgrades', () => {
    const s = { ...newGame(), upgrades: ['espresso_machine' as const] };
    const barista = hiringCandidates(s).find((c) => c.role === 'barista');
    if (!barista) throw new Error('no barista');
    const cap = capacityAfterHire(s, barista);
    expect(cap.before).toBe(10); // floor(8 * 1.25)
    expect(cap.after).toBe(Math.floor((8 + barista.ordersPerHour) * 1.25));
    expect(cap.gain).toBe(cap.after - cap.before);
  });

  it('never displays a reputation milestone that has not been reached', () => {
    const near = objectiveViews({ ...newGame(), reputation: 69.9 }).find((o) => o.id === 'rep_70');
    expect(near?.current).toBe(69);
    expect(near?.complete).toBe(false);
    expect(reputationPoints(69.6)).toBe(69);
    // Percentages round down but are immune to float error (0.29 * 100 = 28.999…).
    expect(percentPoints(0.29)).toBe(29);
    expect(percentPoints(0.58)).toBe(58);
    expect(percentPoints(0.896)).toBe(89);
    expect(percentPoints(1)).toBe(100);
    expect(percentPoints(0)).toBe(0);
    expect(reputationPoints(70)).toBe(70);
    expect(reputationPoints(50)).toBe(50);
  });

  it('formats compact axis labels', () => {
    expect(formatRMCompact(0)).toBe('RM0');
    expect(formatRMCompact(45_000)).toBe('RM450');
    expect(formatRMCompact(150_000)).toBe('RM1.5K');
    expect(formatRMCompact(500_000)).toBe('RM5K');
    expect(formatRMCompact(2_500_000)).toBe('RM25K');
    expect(formatRMCompact(-120_000)).toBe('−RM1.2K');
  });
});
