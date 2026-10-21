import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, STARTING_CASH_SEN } from '../constants';
import { createNewGame, startNextDay } from '../engine';
import {
  BACKUP_KEY,
  clearSave,
  compareProgress,
  createMemoryStorage,
  exportFileName,
  exportSave,
  isEarlierStateOf,
  loadGame,
  MAX_IMPORT_BYTES,
  migrateSave,
  parseImportedSave,
  peekSaveId,
  readCopies,
  readLegacyBackup,
  SAVE_KEY,
  saveGame,
  keepCopy,
  discardCopy,
  COPIES_KEY,
  MAX_KEPT_COPIES,
  type StorageLike,
} from '../save';
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

describe('save ids for multi-tab safety', () => {
  it('stamps every write with a fresh id that can be read without parsing the game', () => {
    const storage = createMemoryStorage();
    const { state } = playDays(newGame(), 4);
    const first = saveGame(storage, state);
    const second = saveGame(storage, state);
    if (!first.ok || !second.ok) throw new Error('save failed');
    expect(first.saveId).not.toBe(second.saveId);
    expect(peekSaveId(storage)).toBe(second.saveId);
    const loaded = loadGame(storage);
    expect(loaded.status === 'loaded' && loaded.saveId).toBe(second.saveId);
  });

  it('reports a missing save, a legacy save without id, and unreadable storage distinctly', () => {
    expect(peekSaveId(createMemoryStorage())).toBeNull();
    const legacy = createMemoryStorage({
      [SAVE_KEY]: JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', game: newGame() }),
    });
    expect(peekSaveId(legacy)).toBeNull();
    const loaded = loadGame(legacy);
    expect(loaded.status === 'loaded' && loaded.saveId).toBeNull();
    expect(peekSaveId(null)).toBeUndefined();
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(peekSaveId(throwing)).toBeUndefined();
  });

  it('detects a write by another tab', () => {
    const storage = createMemoryStorage();
    const mine = saveGame(storage, newGame());
    if (!mine.ok) throw new Error('save failed');
    // Another tab advances and saves.
    const other = saveGame(storage, playDays(newGame(), 1).state);
    if (!other.ok) throw new Error('save failed');
    expect(peekSaveId(storage)).not.toBe(mine.saveId);
    expect(peekSaveId(storage)).toBe(other.saveId);
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

  it('leaves a save from a newer version untouched instead of treating it as corrupt', () => {
    const text = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 1, savedAt: 'x', game: {} });
    const future = createMemoryStorage({ [SAVE_KEY]: text });
    const result = loadGame(future);
    expect(result.status).toBe('newer');
    if (result.status === 'newer') expect(result.error).toContain('lebih baharu');
    expect(future.dump()).toEqual({ [SAVE_KEY]: text });
    expect(parseImportedSave(text)).toMatchObject({ ok: false });
  });

  it('treats unknown formats as corrupt', () => {
    expect(loadGame(createMemoryStorage({ [SAVE_KEY]: '{"foo":1}' })).status).toBe('corrupt');
  });

  it('keeps restorable copies in their own key, newest first, without duplicates', () => {
    const a = playDays(newGame(), 1).state;
    const b = playDays(newGame(77), 2).state;
    const c = playDays(newGame(78), 1).state;
    const d = playDays(newGame(79), 1).state;
    expect(readCopies(createMemoryStorage())).toEqual([]);
    expect(readCopies(createMemoryStorage({ [BACKUP_KEY]: '{broken', [COPIES_KEY]: 'nope' }))).toEqual([]);

    const storage = createMemoryStorage();
    expect(keepCopy(storage, a, new Date('2026-03-01T00:00:00Z'))).toBe(true);
    keepCopy(storage, b);
    keepCopy(storage, a); // the same game again moves to the front instead of duplicating
    expect(readCopies(storage).map((x) => x.game)).toEqual([a, b]);
    keepCopy(storage, c);
    keepCopy(storage, d);
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, a]);
    expect(MAX_KEPT_COPIES).toBe(3);

    // What an older build leaves in BACKUP_KEY when it cannot read a current save is listed last.
    storage.setItem(BACKUP_KEY, exportSave(b));
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, a, b]);
    storage.setItem(BACKUP_KEY, exportSave(c));
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, a]);
    expect(readLegacyBackup(storage)?.game).toEqual(c);

    discardCopy(storage, c);
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, a]);
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('drops the oldest kept copies rather than fail to save the current game', () => {
    const copies = [1, 2, 3].map((seed) => playDays(newGame(seed), 1).state);
    const data = new Map<string, string>();
    // A storage with room for the save plus about one kept copy.
    const quota = exportSave(copies[0]!).length * 2.5;
    const used = () => [...data.values()].reduce((n, v) => n + v.length, 0);
    const limited: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (used() - (data.get(k)?.length ?? 0) + v.length > quota) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
      removeItem: (k) => void data.delete(k),
    };
    for (const c of copies) data.set(COPIES_KEY, JSON.stringify([{ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', game: c }, ...JSON.parse(data.get(COPIES_KEY) ?? '[]')]));
    expect(readCopies(limited)).toHaveLength(3);
    const game = playDays(newGame(), 2).state;
    expect(saveGame(limited, game).ok).toBe(true);
    expect(loadGame(limited)).toMatchObject({ status: 'loaded', game });
    const left = readCopies(limited).map((c) => c.game.seed);
    expect(left.length).toBeLessThan(3);
    expect(left).toEqual([3, 2, 1].slice(0, left.length)); // the newest copies are the ones kept
  });

  it('copes with storage that refuses writes when keeping a copy', () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(keepCopy(full, newGame())).toBe(false);
    expect(keepCopy(null, newGame())).toBe(false);
    expect(() => discardCopy(full, newGame())).not.toThrow();
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

describe('export and import', () => {
  it('round-trips a played game through an exported file', () => {
    const { state } = playDays(newGame(), 6);
    const text = exportSave(state, new Date('2026-02-01T00:00:00Z'));
    const imported = parseImportedSave(text);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.game).toEqual(state);
      expect(imported.migratedFrom).toBeNull();
    }
    // An exported file is also a valid localStorage save.
    const storage = createMemoryStorage({ [SAVE_KEY]: text });
    expect(loadGame(storage).status).toBe('loaded');
  });

  it('names the file after the café and day', () => {
    expect(exportFileName({ ...newGame(), cafeName: 'Kafé Seri Pagi!', day: 12 })).toBe('cafe-empire-kafe-seri-pagi-hari-12.json');
    expect(exportFileName({ ...newGame(), cafeName: '咖啡', day: 3 })).toBe('cafe-empire-kafe-hari-3.json');
  });

  it('rejects files that are not valid saves, with a clear reason', () => {
    const cases = ['', '   ', 'hello', '{"foo":1}', JSON.stringify({ schemaVersion: 2, savedAt: 'x', game: { ...newGame(), cashSen: 1.5 } })];
    for (const text of cases) {
      const result = parseImportedSave(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(5);
    }
    const huge = parseImportedSave('x'.repeat(MAX_IMPORT_BYTES + 1));
    expect(huge.ok === false && huge.error).toContain('terlalu besar');
  });

  it('migrates an imported v1 prototype save', () => {
    const v1 = { version: 1, seed: 9, day: 3, cash: 1234.5, reputation: 55, products: [], staff: [], upgrades: [] };
    const result = parseImportedSave(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFrom).toBe(1);
      expect(result.game.cashSen).toBe(123_450);
    }
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

describe('comparing two copies of a game', () => {
  const start = stockAll(newGame(), 20);
  const day2 = expectOk(startNextDay(settle(start).state, 1)).state;
  const day3 = expectOk(startNextDay(settle(stockAll(day2, 5)).state, 2)).state;

  it('orders copies by how far they have been played', () => {
    expect(compareProgress(day3, day2)).toBeGreaterThan(0);
    expect(compareProgress(day2, day3)).toBeLessThan(0);
    expect(compareProgress(settle(day2).state, day2)).toBeGreaterThan(0);
    expect(compareProgress(stockAll(day2, 5), day2)).toBeGreaterThan(0);
    expect(compareProgress(day2, day2)).toBe(0);
  });

  it('recognises an earlier point of the same game', () => {
    expect(isEarlierStateOf(day2, day3)).toBe(true);
    expect(isEarlierStateOf(start, day3)).toBe(true);
    expect(isEarlierStateOf(newGame(), day3)).toBe(true);
    expect(isEarlierStateOf(day3, day3)).toBe(true);
    expect(isEarlierStateOf(day3, day2)).toBe(false);
  });

  it('treats a different game or a diverging branch as real progress to keep', () => {
    expect(isEarlierStateOf(createNewGame(999), day3)).toBe(false);
    // Day 2 played differently (more stock bought) from what led to day 3.
    const branch = stockAll(day2, 40);
    expect(isEarlierStateOf(branch, day3)).toBe(false);
    expect(isEarlierStateOf(settle(branch).state, day3)).toBe(false);
    // The history needed to tell has been trimmed away.
    expect(isEarlierStateOf(day2, { ...day3, history: day3.history.slice(-1) })).toBe(false);
  });
});
