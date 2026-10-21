import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, STARTING_CASH_SEN } from '../constants';
import { createNewGame, startNextDay } from '../engine';
import { BACKUP_KEY, clearSave, createMemoryStorage, loadGame, migrateSave, SAVE_KEY, saveGame, type StorageLike } from '../save';
import { validateGameState } from '../validate';
import { expectOk, newGame, playDays, settle, stockAll } from './helpers';

describe('save/load round trip', () => {
  it('restores an identical game state', () => {
    const storage = createMemoryStorage();
    const { state } = playDays(newGame(), 5);
    const saved = saveGame(storage, state, new Date('2026-01-01T00:00:00Z'));
    expect(saved.ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.game).toEqual(state);
    expect(loaded.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(loaded.migratedFrom).toBeNull();
  });

  it('round-trips a closed day with its report and keeps settlement locked', () => {
    const storage = createMemoryStorage();
    const { state } = settle(stockAll(newGame()));
    saveGame(storage, state);
    const loaded = loadGame(storage);
    if (loaded.status !== 'loaded') throw new Error('not loaded');
    expect(loaded.game.phase).toBe('closed');
    expect(loaded.game.history).toHaveLength(1);
    expect(loaded.game.lastSettledDay).toBe(1);
    // Continuing after reload works.
    expect(expectOk(startNextDay(loaded.game, 1)).state.day).toBe(2);
  });

  it('writes a versioned envelope', () => {
    const storage = createMemoryStorage();
    saveGame(storage, newGame());
    const raw = JSON.parse(storage.dump()[SAVE_KEY] ?? '{}');
    expect(raw.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(typeof raw.savedAt).toBe('string');
    expect(raw.game.cashSen).toBe(STARTING_CASH_SEN);
  });
});

describe('invalid save recovery', () => {
  it('reports an empty save', () => {
    expect(loadGame(createMemoryStorage()).status).toBe('empty');
  });

  it('recovers from malformed JSON and keeps a backup', () => {
    const storage = createMemoryStorage({ [SAVE_KEY]: '{not json' });
    const result = loadGame(storage);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') expect(result.backedUp).toBe(true);
    expect(storage.dump()[BACKUP_KEY]).toBe('{not json');
  });

  it('rejects saves with invalid values', () => {
    const game = newGame();
    const cases: unknown[] = [
      { ...game, cashSen: 12.5 },
      { ...game, reputation: 150 },
      { ...game, products: { ...game.products, latte: { ...game.products.latte, stock: -1 } } },
      { ...game, products: { ...game.products, latte: undefined } },
      { ...game, staff: [] },
      { ...game, upgrades: ['rocket_ship'] },
      { ...game, phase: 'closed' }, // inconsistent with lastSettledDay
      { ...game, history: [{ day: 1 }] },
      'hello',
      null,
    ];
    for (const bad of cases) {
      const storage = createMemoryStorage({
        [SAVE_KEY]: JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', game: bad }),
      });
      expect(loadGame(storage).status).toBe('corrupt');
    }
  });

  it('rejects unknown and future versions', () => {
    const future = createMemoryStorage({
      [SAVE_KEY]: JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 1, savedAt: 'x', game: {} }),
    });
    const result = loadGame(future);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') expect(result.error).toContain('lebih baharu');
    expect(loadGame(createMemoryStorage({ [SAVE_KEY]: '{"foo":1}' })).status).toBe('corrupt');
  });

  it('handles unavailable or throwing storage gracefully', () => {
    expect(loadGame(null).status).toBe('unavailable');
    expect(saveGame(null, newGame()).ok).toBe(false);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    expect(loadGame(throwing).status).toBe('unavailable');
    const saved = saveGame(throwing, newGame());
    expect(saved.ok).toBe(false);
    expect(clearSave(throwing)).toBe(false);
  });
});

describe('schema migration', () => {
  const v1 = {
    version: 1,
    seed: 4242,
    day: 6,
    cash: 4321.55,
    reputation: 61.27,
    products: [
      { id: 'latte', price: 7.5, cost: 2.2, stock: 12, enabled: true },
      { id: 'croissant', price: 6, cost: 2, stock: 0, enabled: false },
      { id: 'mystery', price: 1, cost: 1, stock: 1, enabled: true },
    ],
    staff: [
      { id: 'a', name: 'Aiman', role: 'barista', wage: 90 },
      { id: 'b', name: 'Siti', role: 'cashier', wage: 70.5 },
    ],
    upgrades: ['signage', 'not_real'],
  };

  it('migrates a v1 prototype save into a valid current game', () => {
    const migrated = migrateSave(v1);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.fromVersion).toBe(1);
    const validated = validateGameState(migrated.game);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const g = validated.state;
    expect(g.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(g.cashSen).toBe(432_155);
    expect(g.day).toBe(6);
    expect(g.phase).toBe('prep');
    expect(g.lastSettledDay).toBe(5);
    expect(g.reputation).toBe(61.3);
    expect(g.products.latte).toMatchObject({ priceSen: 750, unitCostSen: 220, stock: 12, stockValueSen: 2_640 });
    expect(g.products.croissant.enabled).toBe(false);
    expect(g.staff.map((s) => s.wageSen)).toEqual([9_000, 7_050]);
    expect(g.upgrades).toEqual(['signage']);
  });

  it('loads a v1 save from storage and reports the migration', () => {
    const storage = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(v1) });
    const result = loadGame(storage);
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') expect(result.migratedFrom).toBe(1);
  });
});

describe('reset behaviour', () => {
  it('clears the save so the next load starts fresh', () => {
    const storage = createMemoryStorage();
    const { state } = playDays(newGame(), 3);
    saveGame(storage, state);
    expect(clearSave(storage)).toBe(true);
    expect(loadGame(storage).status).toBe('empty');
    const fresh = createNewGame(1);
    expect(fresh.day).toBe(1);
    expect(fresh.cashSen).toBe(STARTING_CASH_SEN);
    expect(fresh.history).toEqual([]);
    expect(fresh.completedObjectives).toEqual([]);
  });
});
