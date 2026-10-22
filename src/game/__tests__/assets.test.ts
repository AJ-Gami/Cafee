import { describe, expect, it } from 'vitest';
import { accumulatedDepreciation, bookValue, depreciateAtClose, depreciationCharge, newAsset, totalBookValue } from '../assets';
import { ASSET_LIFE_DAYS, SAVE_SCHEMA_VERSION } from '../constants';
import { UPGRADES } from '../data/upgrades';
import { buyUpgrade, startNextDay } from '../engine';
import { reconcileReport } from '../reports';
import { migrateSave } from '../save';
import { upgradeViews } from '../selectors';
import type { FixedAsset, GameState } from '../types';
import { validateGameState } from '../validate';
import { expectOk, newGame, playDays, settle, stockAll } from './helpers';

const richGame = (): GameState => ({ ...newGame(), cashSen: 2_000_000, dayStart: { ...newGame().dayStart, cashSen: 2_000_000 } });

function nextDay(s: GameState): GameState {
  return expectOk(startNextDay(s, s.day)).state;
}

describe('depreciation schedule', () => {
  it('charges equal amounts at each close, the last absorbing the rounding, and never more than the cost', () => {
    const asset = { costSen: 180_000, lifeDays: 90 };
    expect(depreciationCharge(asset, 1)).toBe(2_000);
    const odd = { costSen: 100_001, lifeDays: 90 };
    const charges = Array.from({ length: 92 }, (_, i) => depreciationCharge(odd, i + 1));
    expect(charges.slice(0, 89).every((c) => c === 1_111)).toBe(true);
    expect(charges[89]).toBe(100_001 - 1_111 * 89);
    expect(charges.slice(90)).toEqual([0, 0]);
    expect(charges.reduce((a, b) => a + b, 0)).toBe(100_001);
    for (const n of [0, 1, 45, 89, 90, 120]) {
      expect(accumulatedDepreciation(odd, n)).toBe(charges.slice(0, Math.max(0, n)).reduce((a, b) => a + b, 0));
    }
    // A cost smaller than the life is taken at the last close.
    expect(Array.from({ length: 3 }, (_, i) => depreciationCharge({ costSen: 2, lifeDays: 3 }, i + 1))).toEqual([0, 0, 2]);
  });

  it('stops once an asset is fully depreciated', () => {
    let assets: FixedAsset[] = [{ ...newAsset('signage', 1), lifeDays: 3 }];
    const charges: number[] = [];
    for (let i = 0; i < 5; i++) {
      const step = depreciateAtClose(assets);
      charges.push(step.chargeSen);
      assets = step.assets;
    }
    expect(charges).toEqual([20_000, 20_000, 20_000, 0, 0]);
    expect(assets[0]).toMatchObject({ chargedDays: 3 });
    expect(bookValue(assets[0]!)).toBe(0);
  });
});

describe('upgrades as fixed assets', () => {
  it('buying an upgrade records an asset at cost; its first charge is at that day’s close', () => {
    const bought = expectOk(buyUpgrade(richGame(), 'espresso_machine')).state;
    expect(bought.assets).toEqual([{ upgradeId: 'espresso_machine', costSen: 180_000, lifeDays: ASSET_LIFE_DAYS, acquiredDay: 1, chargedDays: 0 }]);
    expect(validateGameState(structuredClone(bought)).ok).toBe(true);
    const { state, report } = settle(stockAll(bought, 40));
    expect(report.capexSen).toBe(180_000);
    expect(report.expenses.depreciationSen).toBe(2_000);
    expect(report).toMatchObject({ openingAssetsSen: 0, closingAssetsSen: 178_000 });
    expect(report.netProfitSen).toBe(report.revenueSen + report.otherIncomeSen - report.cogsSen - report.totalExpensesSen);
    // Depreciation is not a cash payment.
    expect(report.transactions.some((t) => t.label.includes('Susut'))).toBe(false);
    expect(reconcileReport(report).ok).toBe(true);
    expect(reconcileReport(report).checks.map((c) => c.id)).toContain('assets');
    expect(state.assets[0]?.chargedDays).toBe(1);

    const tomorrow = nextDay(state);
    expect(tomorrow.dayStart.assetsSen).toBe(178_000);
    expect(validateGameState(structuredClone(tomorrow)).ok).toBe(true);
    const day2 = settle(stockAll(tomorrow, 40)).report;
    expect(day2).toMatchObject({ openingAssetsSen: 178_000, closingAssetsSen: 176_000, capexSen: 0 });
    expect(day2.expenses.depreciationSen).toBe(2_000);
    expect(reconcileReport(day2).ok).toBe(true);
  });

  it('every report reconciles over a long game with upgrades bought along the way', () => {
    let s = richGame();
    s = expectOk(buyUpgrade(s, 'signage')).state;
    const { state, reports } = playDays(s, 6, 50);
    s = expectOk(buyUpgrade(state, 'pastry_display')).state;
    const more = playDays(s, 10, 50);
    for (const r of [...reports, ...more.reports]) expect(reconcileReport(r).checks.filter((c) => !c.ok)).toEqual([]);
    expect(more.state.assets.map((a) => [a.upgradeId, a.chargedDays])).toEqual([
      ['signage', 16],
      ['pastry_display', 10],
    ]);
    expect(more.state.dayStart.assetsSen).toBe(totalBookValue(more.state.assets));
    expect(validateGameState(structuredClone(more.state)).ok).toBe(true);
  });

  it('shows each owned upgrade’s book value and the charge an upgrade would bring', () => {
    let s = expectOk(buyUpgrade(richGame(), 'signage')).state;
    s = nextDay(settle(stockAll(s, 30)).state);
    const views = upgradeViews(s);
    expect(views.find((v) => v.id === 'signage')).toMatchObject({
      owned: true,
      dailyDepreciationSen: Math.floor(60_000 / 90),
      asset: { bookValueSen: 60_000 - Math.floor(60_000 / 90), daysLeft: 89 },
    });
    expect(views.find((v) => v.id === 'espresso_machine')).toMatchObject({ owned: false, dailyDepreciationSen: 2_000, lifeDays: 90, asset: null });
  });

  it('rejects assets that do not match the upgrades or the days closed', () => {
    let s = expectOk(buyUpgrade(richGame(), 'signage')).state;
    s = nextDay(settle(stockAll(s, 30)).state);
    const clean = structuredClone(s);
    expect(validateGameState(clean).ok).toBe(true);
    const asset = clean.assets[0]!;
    const bad: GameState[] = [
      { ...clean, assets: [] },
      { ...clean, assets: [asset, { ...asset, upgradeId: 'pos_system' }] },
      // Only one close since it was bought (the opening value agrees, so only that rule catches it).
      { ...clean, assets: [{ ...asset, chargedDays: 2 }], dayStart: { ...clean.dayStart, assetsSen: asset.costSen - accumulatedDepreciation(asset, 2) } },
      { ...clean, assets: [{ ...asset, chargedDays: asset.lifeDays + 1 }] },
      { ...clean, assets: [{ ...asset, costSen: 0 }] },
      { ...clean, dayStart: { ...clean.dayStart, assetsSen: asset.costSen } },
    ];
    for (const b of bad) expect(validateGameState(b).ok).toBe(false);
  });
});

describe('saves with fixed assets', () => {
  /** Remove every field schema v5 added, giving the shape a v4 build wrote. */
  function asV4Save(game: GameState): unknown {
    const g = structuredClone(game) as unknown as Record<string, unknown> & {
      dayStart: Record<string, unknown>;
      history: (Record<string, unknown> & { expenses: Record<string, unknown> })[];
    };
    g.schemaVersion = 4;
    delete g.assets;
    delete g.dayStart.assetsSen;
    for (const r of g.history) {
      // A v4 build never expensed upgrades.
      const dep = r.expenses.depreciationSen as number;
      r.totalExpensesSen = (r.totalExpensesSen as number) - dep;
      r.netProfitSen = (r.netProfitSen as number) + dep;
      delete r.openingAssetsSen;
      delete r.closingAssetsSen;
      delete r.expenses.depreciationSen;
    }
    return { schemaVersion: 4, savedAt: '2026-01-01T00:00:00.000Z', game: g };
  }

  function load(save: unknown): GameState {
    const migrated = migrateSave(save);
    if (!migrated.ok) throw new Error(migrated.error);
    const validated = validateGameState(migrated.game);
    if (!validated.ok) throw new Error(validated.errors.join('\n'));
    return validated.state;
  }

  it('migrates a v4 save: upgrades become assets at cost, depreciated from the next close', () => {
    let s = expectOk(buyUpgrade(richGame(), 'signage')).state;
    s = playDays(s, 3, 40).state; // preparing day 4
    s = expectOk(buyUpgrade(s, 'hygiene_system')).state; // bought today
    const v4 = asV4Save(s) as { game: GameState };
    const migrated = load(v4);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.assets).toEqual([
      { upgradeId: 'signage', costSen: 60_000, lifeDays: ASSET_LIFE_DAYS, acquiredDay: 1, chargedDays: 0 },
      { upgradeId: 'hygiene_system', costSen: 65_000, lifeDays: ASSET_LIFE_DAYS, acquiredDay: 4, chargedDays: 0 },
    ]);
    // Owned before today: in the opening book value; bought today: today's investment.
    expect(migrated.dayStart.assetsSen).toBe(60_000);
    for (const r of migrated.history) {
      expect(r.expenses.depreciationSen).toBe(0);
      expect(reconcileReport(r).checks.filter((c) => !c.ok)).toEqual([]);
    }
    const close = settle(stockAll(migrated, 30)).report;
    expect(close.expenses.depreciationSen).toBe(Math.floor(60_000 / 90) + Math.floor(65_000 / 90));
    expect(close).toMatchObject({ openingAssetsSen: 60_000, capexSen: 65_000 });
    expect(reconcileReport(close).ok).toBe(true);
  });

  it('an upgrade whose purchase is no longer in the history counts as owned before today', () => {
    let s = expectOk(buyUpgrade(richGame(), 'signage')).state;
    s = playDays(s, 2, 40).state;
    const v4 = asV4Save(s) as { game: GameState & { history: unknown[] } };
    v4.game.history = v4.game.history.slice(1); // day 1, when it was bought, was trimmed
    const migrated = load(v4);
    expect(migrated.assets[0]).toMatchObject({ acquiredDay: 2, chargedDays: 0 });
    expect(migrated.dayStart.assetsSen).toBe(60_000);
  });

  it('a v4 save without the asset fields does not validate as v5', () => {
    const v4 = asV4Save(expectOk(buyUpgrade(richGame(), 'signage')).state) as { game: Record<string, unknown> };
    expect(validateGameState({ ...v4.game, schemaVersion: SAVE_SCHEMA_VERSION }).ok).toBe(false);
  });

  it('upgrade data stays within what the asset checks accept', () => {
    for (const def of Object.values(UPGRADES)) expect(def.costSen).toBeGreaterThan(0);
  });
});
