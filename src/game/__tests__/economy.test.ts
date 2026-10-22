import { describe, expect, it } from 'vitest';
import {
  addToStock,
  bulkDiscountBps,
  inventoryValue,
  missingIngredient,
  quotePurchase,
  recipeCostToday,
  recipeOf,
  servingsAvailable,
  takeFromStock,
} from '../economy';
import type { IngredientState } from '../types';
import { newGame, withEvent } from './helpers';

const base: IngredientState = { id: 'susu', unitCostSen: 70, stock: 0, stockValueSen: 0 };

describe('purchase quotes', () => {
  it('prices stock at unit cost with bulk discounts', () => {
    const s = newGame();
    expect(quotePurchase(s, 'susu', 10).totalSen).toBe(700);
    expect(bulkDiscountBps(49)).toBe(0);
    const fifty = quotePurchase(s, 'susu', 50);
    expect(fifty.subtotalSen).toBe(3_500);
    expect(fifty.discountSen).toBe(175); // 5%
    expect(fifty.totalSen).toBe(3_325);
    const hundred = quotePurchase(s, 'kopi', 100);
    expect(hundred.discountBps).toBe(800);
    expect(hundred.totalSen).toBe(7_360);
  });

  it('applies forecast supplier price spikes to today’s purchases', () => {
    const s = withEvent(newGame(), 'coffee_price_spike');
    const q = quotePurchase(s, 'kopi', 10);
    expect(q.unitCostSen).toBe(100); // 80 * 1.25
    expect(q.totalSen).toBe(1_000);
    expect(quotePurchase(s, 'teh', 10).unitCostSen).toBe(50);
  });
});

describe('recipes', () => {
  it('cost each product from its ingredients at today’s prices', () => {
    const s = newGame();
    expect(recipeOf('latte')).toEqual([
      ['kopi', 1],
      ['susu', 2],
    ]);
    expect(recipeCostToday(s, 'kopi_o')).toEqual({ unitCostSen: 80, surcharged: false });
    expect(recipeCostToday(s, 'americano')).toEqual({ unitCostSen: 160, surcharged: false });
    expect(recipeCostToday(s, 'latte')).toEqual({ unitCostSen: 220, surcharged: false });
    expect(recipeCostToday(s, 'teh_ais')).toEqual({ unitCostSen: 120, surcharged: false });
    expect(recipeCostToday(s, 'croissant')).toEqual({ unitCostSen: 200, surcharged: false });
    const spike = withEvent(s, 'coffee_price_spike');
    expect(recipeCostToday(spike, 'latte')).toEqual({ unitCostSen: 240, surcharged: true });
    expect(recipeCostToday(spike, 'teh_ais').surcharged).toBe(false);
  });

  it('count the servings the stock can make and name what is missing', () => {
    const s = newGame();
    const ingredients = { ...s.ingredients, kopi: { ...s.ingredients.kopi, stock: 5 }, susu: { ...s.ingredients.susu, stock: 7 } };
    expect(servingsAvailable(ingredients, 'kopi_o')).toBe(5);
    expect(servingsAvailable(ingredients, 'americano')).toBe(2);
    expect(servingsAvailable(ingredients, 'latte')).toBe(3);
    expect(servingsAvailable(ingredients, 'teh_ais')).toBe(0);
    expect(missingIngredient(ingredients, 'teh_ais')).toBe('teh');
    expect(missingIngredient(ingredients, 'latte')).toBeNull();
    expect(missingIngredient({ ...ingredients, susu: { ...ingredients.susu, stock: 1 } }, 'latte')).toBe('susu');
  });
});

describe('weighted-average inventory', () => {
  it('releases value only for units taken', () => {
    let p = addToStock(base, 10, 700);
    const first = takeFromStock(p, 3);
    expect(first.costSen).toBe(210);
    p = first.item;
    expect(p.stock).toBe(7);
    expect(p.stockValueSen).toBe(490);
  });

  it('never leaves residue when the last unit is sold', () => {
    let p = addToStock(base, 3, 1_000); // 333.33 per unit
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const t = takeFromStock(p, 1);
      total += t.costSen;
      p = t.item;
    }
    expect(total).toBe(1_000);
    expect(p.stock).toBe(0);
    expect(p.stockValueSen).toBe(0);
  });

  it('cannot take more than is in stock (no negative inventory)', () => {
    const p = addToStock(base, 2, 140);
    const t = takeFromStock(p, 5);
    expect(t.item.stock).toBe(0);
    expect(t.costSen).toBe(140);
    expect(takeFromStock(t.item, 1).costSen).toBe(0);
    expect(takeFromStock(t.item, 1).item.stock).toBe(0);
  });

  it('blends costs from purchases at different prices', () => {
    let p = addToStock(base, 10, 600); // 60 each
    p = addToStock(p, 10, 800); // 80 each
    const t = takeFromStock(p, 10);
    expect(t.costSen).toBe(700);
    expect(inventoryValue({ ...newGame().ingredients, susu: t.item })).toBe(700);
  });
});
