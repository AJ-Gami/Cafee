import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, STARTING_CASH_SEN } from '../constants';
import { createNewGame, fireStaff, hireStaff, renameCafe, setPrice, setPromotion, startNextDay } from '../engine';
import { hiringCandidates } from '../selectors';
import type { GameState } from '../types';
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
  resolveOldBuildWrite,
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
    expect(keepCopy(storage, a)).toBe(true); // already kept: not duplicated
    expect(readCopies(storage).map((x) => x.game)).toEqual([b, a]);
    keepCopy(storage, c);
    keepCopy(storage, d);
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, b]);
    expect(MAX_KEPT_COPIES).toBe(3);

    // What an older build leaves in BACKUP_KEY when it cannot read a current save is listed last.
    storage.setItem(BACKUP_KEY, exportSave(a));
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, b, a]);
    storage.setItem(BACKUP_KEY, exportSave(c));
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, c, b]);
    expect(readLegacyBackup(storage)?.game).toEqual(c);

    discardCopy(storage, c);
    expect(readCopies(storage).map((x) => x.game)).toEqual([d, b]);
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

describe('comparing copies written by different builds', () => {
  /** The same game as a v2 build stored it, after migration: equal content, different key order. */
  function viaV2(game: GameState): GameState {
    const g = structuredClone(game) as unknown as Record<string, unknown> & {
      dayStart: Record<string, unknown>;
      stats: Record<string, unknown>;
      history: (Record<string, unknown> & { expenses: Record<string, unknown> })[];
    };
    g.schemaVersion = 2;
    delete g.loan;
    delete g.dayStart.debtSen;
    delete g.stats.loansRepaid;
    for (const r of g.history) {
      for (const k of ['loanProceedsSen', 'loanPrincipalRepaidSen', 'openingDebtSen', 'closingDebtSen']) delete r[k];
      delete r.expenses.interestSen;
    }
    const migrated = migrateSave({ schemaVersion: 2, savedAt: 'x', game: g });
    if (!migrated.ok) throw new Error(migrated.error);
    return migrated.game as GameState;
  }

  it('compares content, not the order fields were written in', () => {
    const played = playDays(newGame(), 3).state;
    const old = viaV2(played);
    expect(JSON.stringify(old.history[0]) === JSON.stringify(played.history[0])).toBe(false);
    expect(isEarlierStateOf(old, played)).toBe(true);
    expect(isEarlierStateOf(played, old)).toBe(true);
  });

  it('recognises a mid-preparation snapshot once that day has been settled', () => {
    const prep = stockAll(newGame(), 20);
    const closed = settle(prep).state;
    expect(isEarlierStateOf(prep, closed)).toBe(true);
    expect(isEarlierStateOf(prep, expectOk(startNextDay(closed, 1)).state)).toBe(true);
  });

  it('treats same-day changes that record no transaction as play to keep', () => {
    const prep = stockAll(newGame(), 20);
    const renamed = { ...prep, cafeName: 'Kafe Baru' };
    const repriced = { ...prep, products: { ...prep.products, latte: { ...prep.products.latte, priceSen: 800 } } };
    const bought = stockAll(prep, 5);
    expect(isEarlierStateOf(renamed, bought)).toBe(false);
    expect(isEarlierStateOf(repriced, bought)).toBe(false);
    // Hiring records a transaction, so a later state may simply have more staff.
    const candidate = hiringCandidates(prep)[0]!;
    expect(isEarlierStateOf(prep, expectOk(hireStaff(prep, candidate.id)).state)).toBe(true);
  });

  it('decides which game stays when an older build writes', () => {
    const day2 = playDays(newGame(), 1).state;
    const day4 = playDays(newGame(), 3).state;
    const other = playDays(newGame(999), 5).state;
    expect(resolveOldBuildWrite(day4, day2)).toBe('ours');
    expect(resolveOldBuildWrite(day2, day4)).toBe('theirs');
    expect(resolveOldBuildWrite(day2, day2)).toBe('theirs');
    // Different games: this tab's game stays, unless it is bankrupt and the other is not.
    expect(resolveOldBuildWrite(day2, other)).toBe('ours');
    expect(resolveOldBuildWrite({ ...day2, status: 'bankrupt' }, other)).toBe('theirs');
    expect(resolveOldBuildWrite(day2, { ...other, status: 'bankrupt' })).toBe('ours');
  });

  it('keeps only copies holding play the current game and other copies lack', () => {
    const storage = createMemoryStorage();
    const start = stockAll(newGame(), 20);
    const day2 = expectOk(startNextDay(settle(start).state, 1)).state;
    const day3 = expectOk(startNextDay(settle(stockAll(day2, 5)).state, 2)).state;
    const other = playDays(newGame(555), 2).state;

    expect(keepCopy(storage, newGame())).toBe(false); // nothing played
    expect(readCopies(createMemoryStorage({ [BACKUP_KEY]: exportSave(newGame(8)) }))).toEqual([]);
    expect(keepCopy(storage, day2, new Date(), day3)).toBe(false); // earlier point of the game in play
    expect(keepCopy(storage, other)).toBe(true);
    expect(keepCopy(storage, day2)).toBe(true);
    expect(keepCopy(storage, day3)).toBe(true); // replaces its own earlier point, day 2
    expect(readCopies(storage).map((c) => c.game.day)).toEqual([3, 3]);
    expect(readCopies(storage)[1]?.game.seed).toBe(555);
    expect(keepCopy(storage, start)).toBe(true); // already contained in the day-3 copy
    expect(readCopies(storage)).toHaveLength(2);
    // The same game written by another build is one copy, not two.
    storage.setItem(BACKUP_KEY, exportSave(other));
    expect(readCopies(storage)).toHaveLength(2);
  });
});

describe('copies after team changes, trimmed history and newer versions', () => {
  const day1 = stockAll(newGame(), 20);
  const candidate = hiringCandidates(day1)[0]!;
  const twoStaff = expectOk(startNextDay(settle(expectOk(hireStaff(day1, candidate.id)).state).state, 1)).state;

  it('a firing (no transaction) is play the other copy lacks', () => {
    const fired = expectOk(fireStaff(twoStaff, candidate.id)).state;
    const bought = stockAll(twoStaff, 5);
    expect(isEarlierStateOf(fired, bought)).toBe(false);
    expect(keepCopy(createMemoryStorage(), fired, new Date(), bought)).toBe(true);
  });

  it('a snapshot from before a later firing or hiring is still an earlier point', () => {
    const later = expectOk(fireStaff(stockAll(twoStaff, 3), candidate.id)).state;
    expect(isEarlierStateOf(twoStaff, later)).toBe(true);
    const next = hiringCandidates(twoStaff).find((c) => !twoStaff.staff.some((s) => s.id === c.id))!;
    const fired = expectOk(fireStaff(twoStaff, candidate.id)).state;
    expect(isEarlierStateOf(fired, expectOk(hireStaff(fired, next.id)).state)).toBe(true);
  });

  it('an old snapshot whose history was trimmed never pushes a real copy out', () => {
    const early = playDays(newGame(), 3).state;
    const late = playDays(early, 61).state;
    expect(late.history[0]!.day).toBeGreaterThan(early.lastSettledDay); // cannot be checked exactly
    const storage = createMemoryStorage();
    const others = [3, 2, 1].map((seed) => playDays(newGame(seed), 2).state);
    for (const g of others) keepCopy(storage, g);
    expect(keepCopy(storage, early, new Date(), late)).toBe(false);
    expect(readCopies(storage).map((c) => c.game.seed)).toEqual([1, 2, 3]);
  });

  it('leaves copies written by a newer version untouched', () => {
    const storage = createMemoryStorage();
    const future = { schemaVersion: SAVE_SCHEMA_VERSION + 1, savedAt: 'x', game: { schemaVersion: SAVE_SCHEMA_VERSION + 1, from: 'later build' } };
    storage.setItem(COPIES_KEY, JSON.stringify([future]));
    expect(keepCopy(storage, playDays(newGame(7), 2).state)).toBe(true);
    const list = JSON.parse(storage.getItem(COPIES_KEY) ?? '[]') as { schemaVersion: number }[];
    expect(list.map((e) => e.schemaVersion)).toEqual([SAVE_SCHEMA_VERSION, SAVE_SCHEMA_VERSION + 1]);
  });
});

describe('copies: choices checked against settled days, people, renames and v1 games', () => {
  const base = stockAll(newGame(), 20);

  it('matches newcomers to their own hiring, not just a count of hires', () => {
    const [a, b] = hiringCandidates(base);
    const founder = base.staff[0]!;
    const hired = expectOk(hireStaff(base, a!.id)).state;
    const x = expectOk(fireStaff(hired, a!.id)).state; // keeps the founder
    let y = expectOk(fireStaff(hired, founder.id)).state; // keeps the newcomer instead
    y = expectOk(fireStaff(expectOk(hireStaff(y, b!.id)).state, b!.id)).state;
    expect(isEarlierStateOf(x, y)).toBe(false);
  });

  it('checks choices without a transaction against the day the other copy settled', () => {
    const fork = playDays(newGame(), 4).state;
    const opened = settle(stockAll(fork, 5)).state;
    expect(isEarlierStateOf(fork, opened)).toBe(true);
    expect(isEarlierStateOf({ ...fork, cafeName: 'Kafe Baru' }, opened)).toBe(false);
    expect(isEarlierStateOf(expectOk(setPrice(fork, 'latte', 900)).state, opened)).toBe(false);
    expect(isEarlierStateOf(expectOk(setPromotion(fork, 'social')).state, opened)).toBe(false);
    expect(isEarlierStateOf(expectOk(setPromotion(fork, 'social')).state, settle(expectOk(setPromotion(fork, 'social')).state).state)).toBe(true);
  });

  it('counts letting someone go even after the other copy settled that day', () => {
    const candidate = hiringCandidates(base)[0]!;
    const twoStaff = expectOk(startNextDay(settle(expectOk(hireStaff(base, candidate.id)).state).state, 1)).state;
    const fired = expectOk(fireStaff(twoStaff, candidate.id)).state;
    const openedWithBoth = settle(stockAll(twoStaff, 5)).state;
    expect(isEarlierStateOf(fired, openedWithBoth)).toBe(false);
    expect(isEarlierStateOf(fired, settle(stockAll(fired, 5)).state)).toBe(true);
  });

  it('counts a rename made after closing', () => {
    const closed = settle(base).state;
    const renamed = expectOk(renameCafe(closed, 'Kafe Baru')).state;
    expect(isEarlierStateOf(closed, renamed)).toBe(true);
    expect(isEarlierStateOf(renamed, closed)).toBe(false);
    expect(isEarlierStateOf(renamed, expectOk(startNextDay(closed, 1)).state)).toBe(false);
    expect(isEarlierStateOf(renamed, expectOk(startNextDay(renamed, 1)).state)).toBe(true);
  });

  it('recognises earlier points of a game migrated from v1 (no reports)', () => {
    const migrated = migrateSave({ version: 1, seed: 777, day: 5, cash: 4200.5, reputation: 60, products: [], staff: [], upgrades: [] });
    if (!migrated.ok) throw new Error(migrated.error);
    const g = migrated.game as GameState;
    expect(isEarlierStateOf(g, g)).toBe(true);
    expect(isEarlierStateOf(g, structuredClone(g))).toBe(true);
    const bought = stockAll(g, 5);
    expect(isEarlierStateOf(g, bought)).toBe(true);
    expect(isEarlierStateOf(g, settle(bought).state)).toBe(true);
    expect(isEarlierStateOf(bought, g)).toBe(false);
    expect(keepCopy(createMemoryStorage(), g, new Date(), g)).toBe(false);
  });

  it('lets an untouched game lose to a played café from an older build', () => {
    const played = playDays(newGame(31), 4).state;
    expect(resolveOldBuildWrite(newGame(32), played)).toBe('theirs');
    expect(resolveOldBuildWrite(played, newGame(32))).toBe('ours');
  });

  it('keeps a checked, diverging branch of the game in play over older copies of other games', () => {
    const storage = createMemoryStorage();
    for (const seed of [3, 2, 1]) keepCopy(storage, playDays(newGame(seed), 2).state);
    const fork = playDays(newGame(), 5).state;
    const ours = playDays(fork, 4, 40).state;
    const theirs = playDays(fork, 2, 15).state;
    expect(isEarlierStateOf(theirs, ours)).toBe(false);
    expect(keepCopy(storage, theirs, new Date(), ours)).toBe(true);
    expect(readCopies(storage).map((c) => c.game.seed)).toEqual([theirs.seed, 1, 2]);
  });
});

describe('copies: who made a change, and storage that stays full', () => {
  it('a snapshot stays an earlier point when only the later copy renamed, repriced or promoted', () => {
    const fork = playDays(newGame(), 2).state; // day 3 preparation, nothing chosen yet
    const variants = [
      expectOk(renameCafe(fork, 'Kafe Baru')).state,
      expectOk(setPrice(fork, 'kopi_o', fork.products.kopi_o.priceSen + 10)).state,
      expectOk(setPromotion(fork, 'flyers')).state,
    ];
    for (const later of variants) {
      expect(isEarlierStateOf(fork, later)).toBe(true);
      expect(isEarlierStateOf(fork, playDays(later, 2).state)).toBe(true);
    }
    // The copy that made the change still differs from one that did not.
    for (const changed of variants) expect(isEarlierStateOf(changed, playDays(fork, 2).state)).toBe(false);
  });

  it('can ignore choices when the earlier copy is known to have made none', () => {
    const fork = playDays(newGame(), 2).state;
    const later = expectOk(setPrice(fork, 'latte', 900)).state;
    expect(isEarlierStateOf(later, fork)).toBe(false);
    expect(isEarlierStateOf(fork, later, false)).toBe(true);
    // A different line of play is still different.
    expect(isEarlierStateOf(playDays(fork, 2, 15).state, playDays(fork, 3, 40).state, false)).toBe(false);
  });

  it('never lets an unplayed game win over a played one, bankrupt or not', () => {
    const bankrupt = { ...playDays(newGame(41), 3).state, status: 'bankrupt' as const };
    expect(resolveOldBuildWrite(bankrupt, newGame(42))).toBe('ours');
  });

  it('puts kept copies back when dropping them could not make room for the save', () => {
    const copies = createMemoryStorage();
    for (const seed of [1, 2]) keepCopy(copies, playDays(newGame(seed), 2).state);
    const copiesText = copies.getItem(COPIES_KEY) ?? '';
    const data = new Map<string, string>([[COPIES_KEY, copiesText]]);
    const limited: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (k === SAVE_KEY && v.length > 1_000) throw new Error('QuotaExceededError'); // never fits
        data.set(k, v);
      },
      removeItem: (k) => void data.delete(k),
    };
    expect(saveGame(limited, playDays(newGame(), 3).state).ok).toBe(false);
    expect(data.get(COPIES_KEY)).toBe(copiesText);
  });
});

describe('copies: choices measured from a known starting point', () => {
  const fork = playDays(newGame(), 2).state; // day 3 preparation

  it('records the name and prices each day starts with', () => {
    expect(newGame().dayStart).toMatchObject({ cafeName: 'Kopi Kita', priceSen: { kopi_o: 350, latte: 700 } });
    const renamed = expectOk(renameCafe(settle(expectOk(setPrice(fork, 'latte', 760)).state).state, 'Kafe Petang')).state;
    expect(expectOk(startNextDay(renamed, 3)).state.dayStart).toMatchObject({ cafeName: 'Kafe Petang', priceSen: { latte: 760 } });
    expect(validateGameState({ ...structuredClone(fork), dayStart: { ...fork.dayStart, priceSen: { kopi_o: -1 } } }).ok).toBe(false);
  });

  it('counts undoing a choice the other copy still has, when measured from what both shared', () => {
    const shared = expectOk(setPromotion(fork, 'flyers')).state;
    const theirs = stockAll(shared, 5);
    for (const ours of [
      expectOk(setPromotion(shared, 'none')).state,
      expectOk(setPrice(expectOk(setPromotion(fork, 'flyers')).state, 'latte', 900)).state, // a change of its own
    ]) {
      expect(isEarlierStateOf(ours, theirs, shared)).toBe(false);
      expect(keepCopy(createMemoryStorage(), ours, new Date(), theirs, shared)).toBe(true);
    }
    // Measured from the same shared state, a copy that changed nothing is still an earlier point.
    expect(isEarlierStateOf(shared, theirs, shared)).toBe(true);
    // A price the other tab set, put back to the day's starting price here: invisible from the day
    // start, but a change from what both shared.
    const sharedPrice = expectOk(setPrice(fork, 'latte', 900)).state;
    const undone = expectOk(setPrice(sharedPrice, 'latte', fork.products.latte.priceSen)).state;
    expect(isEarlierStateOf(undone, stockAll(sharedPrice, 5))).toBe(true);
    expect(isEarlierStateOf(undone, stockAll(sharedPrice, 5), sharedPrice)).toBe(false);
  });

  it('counts a rename back after a rename made once the previous day had closed', () => {
    const closed = expectOk(renameCafe(settle(stockAll(fork, 5)).state, 'Kafe Petang')).state;
    const next = expectOk(startNextDay(closed, 3)).state;
    const ours = expectOk(renameCafe(next, 'Kopi Kita')).state;
    expect(isEarlierStateOf(ours, stockAll(next, 5))).toBe(false);
    expect(isEarlierStateOf(next, expectOk(renameCafe(stockAll(next, 5), 'Kafe Malam')).state)).toBe(true);
  });

  it('counts a 1-sen price change the day after a discount promotion', () => {
    let g = expectOk(setPromotion(expectOk(setPrice(stockAll(newGame(), 30), 'kopi_o', 455)).state, 'discount10')).state;
    g = expectOk(startNextDay(settle(g).state, 1)).state;
    expect(isEarlierStateOf(expectOk(setPrice(g, 'kopi_o', 454)).state, stockAll(g, 5))).toBe(false);
  });

  it('counts every difference when the day start is unknown (game migrated from v1)', () => {
    const migrated = migrateSave({ version: 1, seed: 777, day: 5, cash: 4200.5, reputation: 60, products: [], staff: [], upgrades: [] });
    if (!migrated.ok) throw new Error(migrated.error);
    const g = migrated.game as GameState;
    const later = stockAll(g, 5);
    expect(isEarlierStateOf(expectOk(renameCafe(g, 'Kafe Ali')).state, later)).toBe(false);
    expect(isEarlierStateOf(expectOk(setPrice(g, 'latte', 990)).state, later)).toBe(false);
    expect(isEarlierStateOf(g, later)).toBe(true);
  });
});
