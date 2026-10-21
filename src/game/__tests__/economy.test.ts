import { describe, expect, it } from 'vitest';
import { addToStock, bulkDiscountBps, inventoryValue, quotePurchase, takeFromStock } from '../economy';
import type { ProductState } from '../types';
import { newGame, withEvent } from './helpers';

const base: ProductState = { id: 'latte', priceSen: 700, unitCostSen: 220, stock: 0, stockValueSen: 0, enabled: true };

describe('purchase quotes', () => {
  it('prices stock at unit cost with bulk discounts', () => {
    const s = newGame();
    expect(quotePurchase(s, 'latte', 10).totalSen).toBe(2_200);
    expect(bulkDiscountBps(49)).toBe(0);
    const fifty = quotePurchase(s, 'latte', 50);
    expect(fifty.subtotalSen).toBe(11_000);
    expect(fifty.discountSen).toBe(550); // 5%
    expect(fifty.totalSen).toBe(10_450);
    const hundred = quotePurchase(s, 'kopi_o', 100);
    expect(hundred.discountBps).toBe(800);
    expect(hundred.totalSen).toBe(9_200);
  });

  it('applies forecast supplier price spikes to today’s purchases', () => {
    const s = withEvent(newGame(), 'coffee_price_spike');
    const q = quotePurchase(s, 'americano', 10);
    expect(q.unitCostSen).toBe(188); // 150 * 1.25 = 187.5 -> 188
    expect(q.totalSen).toBe(1_880);
    expect(quotePurchase(s, 'teh_ais', 10).unitCostSen).toBe(120);
  });
});

describe('weighted-average inventory', () => {
  it('releases value only for units taken', () => {
    let p = addToStock(base, 10, 2_200);
    const first = takeFromStock(p, 3);
    expect(first.costSen).toBe(660);
    p = first.product;
    expect(p.stock).toBe(7);
    expect(p.stockValueSen).toBe(1_540);
  });

  it('never leaves residue when the last unit is sold', () => {
    let p = addToStock(base, 3, 1_000); // 333.33 per unit
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const t = takeFromStock(p, 1);
      total += t.costSen;
      p = t.product;
    }
    expect(total).toBe(1_000);
    expect(p.stock).toBe(0);
    expect(p.stockValueSen).toBe(0);
  });

  it('cannot take more than is in stock (no negative inventory)', () => {
    const p = addToStock(base, 2, 440);
    const t = takeFromStock(p, 5);
    expect(t.product.stock).toBe(0);
    expect(t.costSen).toBe(440);
    expect(takeFromStock(t.product, 1).costSen).toBe(0);
    expect(takeFromStock(t.product, 1).product.stock).toBe(0);
  });

  it('blends costs from purchases at different prices', () => {
    let p = addToStock(base, 10, 2_000); // 200 each
    p = addToStock(p, 10, 3_000); // 300 each
    const t = takeFromStock(p, 10);
    expect(t.costSen).toBe(2_500);
    expect(inventoryValue({ ...newGame().products, latte: t.product })).toBe(2_500);
  });
});
