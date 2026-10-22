import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../constants';
import { inventoryValue, spoilageRate } from '../economy';
import { buyUpgrade, purchaseStockBatch } from '../engine';
import { reconcileReport } from '../reports';
import { migrateSave } from '../save';
import type { GameState } from '../types';
import { validateGameState } from '../validate';
import { expectOk, newGame, playDays, purchaseLines, settle, stockAll, withProductStock } from './helpers';

/** A v5 save holding `stock` per product, as the last build before ingredient stock wrote it. */
function v5Save(game: GameState, stock: Partial<Record<keyof GameState['products'], [number, number]>>): unknown {
  const g = withProductStock(game);
  for (const [id, [units, valueSen]] of Object.entries(stock)) g.products[id] = { ...g.products[id], stock: units, stockValueSen: valueSen };
  g.schemaVersion = 5;
  return { schemaVersion: 5, savedAt: '2026-01-01T00:00:00.000Z', game: g };
}

function load(save: unknown): GameState {
  const migrated = migrateSave(save);
  if (!migrated.ok) throw new Error(migrated.error);
  const validated = validateGameState(migrated.game);
  if (!validated.ok) throw new Error(validated.errors.join('\n'));
  return validated.state;
}

describe('moving a save to ingredient stock (v5 → v6)', () => {
  it('turns each product’s units into its recipe, keeping the inventory value exactly', () => {
    const game = load(
      v5Save(newGame(), {
        kopi_o: [10, 1_000],
        americano: [5, 750],
        latte: [12, 2_640],
        teh_ais: [4, 480],
        croissant: [3, 601],
      }),
    );
    expect(game.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(game.ingredients.kopi).toMatchObject({ stock: 10 + 2 * 5 + 12, stockValueSen: 1_000 + 750 + 960 });
    expect(game.ingredients.susu).toMatchObject({ stock: 2 * 12 + 4, stockValueSen: 1_680 + 280 });
    expect(game.ingredients.teh).toMatchObject({ stock: 4, stockValueSen: 200 });
    expect(game.ingredients.pastri).toMatchObject({ stock: 3, stockValueSen: 601 });
    expect(inventoryValue(game.ingredients)).toBe(1_000 + 750 + 2_640 + 480 + 601);
    expect(game.products.latte).toEqual({ id: 'latte', priceSen: 700, enabled: true });
  });

  it('restarts supplier prices from the ingredient list, less the supplier contract if owned', () => {
    const owner = {
      ...newGame(),
      cashSen: 10_000_000,
      completedObjectives: [
        { id: 'cash_25000' as const, day: 1 },
        { id: 'revenue_1200' as const, day: 1 },
        { id: 'rep_90' as const, day: 1 },
      ],
    };
    const contracted = expectOk(buyUpgrade(owner, 'supplier_contract')).state;
    const game = load(v5Save(contracted, {}));
    expect([game.ingredients.kopi.unitCostSen, game.ingredients.susu.unitCostSen, game.ingredients.pastri.unitCostSen]).toEqual([72, 63, 180]);
    expect(load(v5Save(newGame(), {})).ingredients.kopi.unitCostSen).toBe(80);
  });

  it('keeps old reports as they were (spoilage on the product lines) and the next close reports ingredients', () => {
    const played = playDays(newGame(), 3, 40).state;
    const game = load({ ...(v5Save(played, {}) as object) });
    for (const r of game.history) {
      expect(r.ingredients).toBeNull();
      expect(r.products.every((l) => typeof l.spoiledUnits === 'number' && typeof l.closingStock === 'number')).toBe(true);
      expect(reconcileReport(r).checks.filter((c) => !c.ok)).toEqual([]);
    }
    const next = settle(stockAll(game, 30)).report;
    expect(next.ingredients?.map((l) => l.ingredientId)).toEqual(['kopi', 'susu', 'teh', 'pastri']);
    expect(reconcileReport(next).checks.filter((c) => !c.ok)).toEqual([]);
    expect(reconcileReport(next).checks.map((c) => c.id)).toContain('cogs-ingredients');
  });

  it('counts a product purchase made before the upgrade in that day’s ingredient lines', () => {
    const bought = expectOk(purchaseStockBatch(newGame(), purchaseLines({ kopi: 30, susu: 60, teh: 30, pastri: 30 }))).state;
    const game = load(v5Save(bought, {}));
    expect(game.dayTransactions.every((t) => t.productId && !t.ingredientId)).toBe(true);
    const report = settle(game).report;
    // The fixture credits milk and tea purchases to teh ais (1 milk + 1 tea each) and coffee to kopi o.
    const purchased = Object.fromEntries(report.ingredients!.map((l) => [l.ingredientId, l.purchased]));
    expect(purchased).toEqual({ kopi: 30, susu: 60 + 30, teh: 60 + 30, pastri: 30 });
  });
});

describe('ingredient validation', () => {
  it('rejects a new report without ingredient lines or with impossible ones, and an old one without product stock', () => {
    const { state } = playDays(newGame(), 2, 30);
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
    const r = state.history[0]!;
    const bad = [
      { ...r, ingredients: undefined },
      { ...r, ingredients: [{ ...r.ingredients![0]!, used: -1 }] },
      { ...r, ingredients: [{ ...r.ingredients![0]!, ingredientId: 'gula' }] },
      { ...r, ingredients: null }, // product lines lack their old stock fields
    ];
    for (const b of bad) expect(validateGameState({ ...structuredClone(state), history: [b, ...state.history.slice(1)] }).ok).toBe(false);
  });
});

describe('perishable ingredients', () => {
  it('spoil at their own rate, which the pastry display cuts for pastry', () => {
    expect(spoilageRate('susu', [])).toBe(0.05);
    expect(spoilageRate('pastri', [])).toBe(0.4);
    expect(spoilageRate('pastri', ['pastry_display'])).toBeCloseTo(0.16);
    expect(spoilageRate('kopi', ['pastry_display'])).toBe(0);
  });
});
