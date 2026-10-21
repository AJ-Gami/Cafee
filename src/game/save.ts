/**
 * Versioned local save manager.
 *
 * Saves live only in this browser's localStorage on this device — nothing is
 * uploaded or synchronised anywhere.
 *
 * Schema history
 *   v1 (prototype): a flat object `{ version: 1, seed, day, cash, reputation,
 *       products: [{ id, price, cost, stock, enabled }], staff: [{ id, name,
 *       role, wage }], upgrades }` with money stored as ringgit decimals and no
 *       ledger, reports or stats.
 *   v2: envelope `{ schemaVersion: 2, savedAt, game }`, all money in integer
 *       sen, transaction ledger, daily reports and stats.
 *   v3 (current): adds bank loans — `game.loan`, `dayStart.debtSen`,
 *       `stats.loansRepaid`, loan transaction types, and per-report
 *       `loanProceedsSen`, `loanPrincipalRepaidSen`, `openingDebtSen`,
 *       `closingDebtSen` and `expenses.interestSen`.
 */
import { MAX_PRICE_SEN, MAX_STOCK_PER_PRODUCT, MIN_PRICE_SEN, SAVE_SCHEMA_VERSION } from './constants';
import { UPGRADES } from './data/upgrades';
import { createNewGame, sanitizeCafeName } from './engine';
import { inventoryValue } from './economy';
import type { GameState, ProductId, StaffMember, UpgradeId } from './types';
import { PRODUCT_IDS } from './types';
import { validateGameState } from './validate';

export const SAVE_KEY = 'rlt-cafe-empire/save';
export const BACKUP_KEY = 'rlt-cafe-empire/save-rosak';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: string;
  /** Random id of this write, used to detect saves made by another tab. Absent in older saves. */
  saveId?: string;
  game: GameState;
}

/** Random id for a save write (not security-sensitive). */
export function newSaveId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(2);
    cryptoObj.getRandomValues(buf);
    return `${(buf[0] ?? 0).toString(36)}${(buf[1] ?? 0).toString(36)}`;
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Cheaply read the id of the stored save without parsing the whole game.
 * Returns null when there is no save or it has no id, and undefined when storage cannot be read.
 */
export function peekSaveId(storage: StorageLike | null): string | null | undefined {
  if (!storage) return undefined;
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return undefined;
  }
  if (text === null) return null;
  // saveGame writes saveId before the (large) game object, so it sits near the start.
  const match = /"saveId":"([^"]{1,64})"/.exec(text.slice(0, 256));
  return match?.[1] ?? null;
}

/** Returns localStorage if it is present and writable, otherwise null (private mode, disabled storage, SSR). */
export function getBrowserStorage(): StorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) return null;
    const probe = 'rlt-cafe-empire/probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** In-memory storage used for tests and as a fallback when localStorage is unavailable. */
export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ringgitToSen(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(value * 100);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** v1 prototype save -> v2 game state (built on today's new-game defaults, so later migrations are no-ops on it). */
function migrateV1toV2(v1: Obj): GameState {
  const seed = clampInt(v1.seed, 0, 0xffffffff, 1);
  const base = createNewGame(seed, typeof v1.cafeName === 'string' ? (sanitizeCafeName(v1.cafeName) ?? undefined) : undefined);
  const day = clampInt(v1.day, 1, 100_000, 1);

  const products = { ...base.products };
  if (Array.isArray(v1.products)) {
    for (const raw of v1.products) {
      if (!isObj(raw) || !(PRODUCT_IDS as readonly unknown[]).includes(raw.id)) continue;
      const id = raw.id as ProductId;
      const unitCostSen = clampInt(ringgitToSen(raw.cost, products[id].unitCostSen), 0, MAX_PRICE_SEN, products[id].unitCostSen);
      const stock = clampInt(raw.stock, 0, MAX_STOCK_PER_PRODUCT, 0);
      products[id] = {
        ...products[id],
        priceSen: clampInt(ringgitToSen(raw.price, products[id].priceSen), MIN_PRICE_SEN, MAX_PRICE_SEN, products[id].priceSen),
        unitCostSen,
        stock,
        // v1 had no inventory valuation; value remaining stock at its unit cost.
        stockValueSen: stock * unitCostSen,
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      };
    }
  }

  const staff: StaffMember[] = [];
  if (Array.isArray(v1.staff)) {
    v1.staff.forEach((raw, i) => {
      if (!isObj(raw) || typeof raw.name !== 'string') return;
      const role = raw.role === 'cashier' ? 'cashier' : 'barista';
      staff.push({
        id: typeof raw.id === 'string' ? raw.id : `staff-v1-${i}`,
        name: raw.name.slice(0, 60),
        role,
        wageSen: clampInt(ringgitToSen(raw.wage, 9_000), 0, 1_000_000, 9_000),
        ordersPerHour: role === 'barista' ? 8 : 5,
        hiredDay: 1,
      });
    });
  }
  if (!staff.some((s) => s.role === 'barista')) staff.unshift(...base.staff);

  const upgrades = Array.isArray(v1.upgrades)
    ? [...new Set(v1.upgrades.filter((u): u is UpgradeId => typeof u === 'string' && u in UPGRADES))]
    : [];

  const cashSen = ringgitToSen(v1.cash, base.cashSen);
  return {
    ...base,
    day,
    phase: 'prep',
    cashSen,
    reputation: Math.min(100, Math.max(0, typeof v1.reputation === 'number' && Number.isFinite(v1.reputation) ? Math.round(v1.reputation * 10) / 10 : base.reputation)),
    products,
    staff,
    upgrades,
    lastSettledDay: day - 1,
    dayStart: { cashSen, inventorySen: inventoryValue(products), debtSen: 0, staffNames: staff.map((s) => s.name) },
    stats: { ...base.stats, daysCompleted: day - 1 },
  };
}

/** v2 -> v3: no v2 café ever had a loan, so every new loan field starts at zero. */
function migrateV2toV3(v2: unknown): unknown {
  if (!isObj(v2)) return v2;
  return {
    ...v2,
    schemaVersion: 3,
    loan: null,
    dayStart: isObj(v2.dayStart) ? { ...v2.dayStart, debtSen: 0 } : v2.dayStart,
    stats: isObj(v2.stats) ? { ...v2.stats, loansRepaid: 0 } : v2.stats,
    history: Array.isArray(v2.history)
      ? v2.history.map((r: unknown) =>
          isObj(r)
            ? {
                ...r,
                loanProceedsSen: 0,
                loanPrincipalRepaidSen: 0,
                openingDebtSen: 0,
                closingDebtSen: 0,
                expenses: isObj(r.expenses) ? { ...r.expenses, interestSen: 0 } : r.expenses,
              }
            : r,
        )
      : v2.history,
  };
}

export type MigrationResult =
  | { ok: true; game: unknown; fromVersion: number }
  /** `newer`: written by a newer version of the game, so this build must not touch it. */
  | { ok: false; error: string; newer?: boolean };

/** Bring any known save format up to the current schema version (data is validated afterwards). */
export function migrateSave(raw: unknown): MigrationResult {
  if (!isObj(raw)) return { ok: false, error: 'Format simpanan tidak dikenali.' };

  let version: number;
  let game: unknown;
  if (typeof raw.schemaVersion === 'number' && 'game' in raw) {
    version = raw.schemaVersion;
    game = raw.game;
  } else if (raw.version === 1) {
    version = 1;
    game = raw;
  } else {
    return { ok: false, error: 'Versi simpanan tidak dikenali.' };
  }
  const fromVersion = version;

  if (version > SAVE_SCHEMA_VERSION) {
    return { ok: false, error: 'Simpanan ini daripada versi permainan yang lebih baharu.', newer: true };
  }
  if (version === 1) {
    if (!isObj(game)) return { ok: false, error: 'Simpanan v1 rosak.' };
    game = migrateV1toV2(game);
    version = 2;
  }
  if (version === 2) {
    game = migrateV2toV3(game);
    version = 3;
  }
  if (version !== SAVE_SCHEMA_VERSION) return { ok: false, error: 'Migrasi simpanan tidak lengkap.' };
  return { ok: true, game, fromVersion };
}

// ---------------------------------------------------------------------------
// Load / save / clear
// ---------------------------------------------------------------------------

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; game: GameState; savedAt: string | null; saveId: string | null; migratedFrom: number | null }
  | { status: 'corrupt'; error: string; backedUp: boolean }
  /** The save is valid for a newer version of the game: leave it untouched and ask for a reload. */
  | { status: 'newer'; error: string }
  | { status: 'unavailable' };

export function loadGame(storage: StorageLike | null): LoadResult {
  if (!storage) return { status: 'unavailable' };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (text === null) return { status: 'empty' };

  const corrupt = (error: string): LoadResult => {
    let backedUp = false;
    try {
      storage.setItem(BACKUP_KEY, text as string);
      backedUp = true;
    } catch {
      backedUp = false;
    }
    return { status: 'corrupt', error, backedUp };
  };

  const decoded = decodeSave(text);
  if (!decoded.ok) return decoded.newer ? { status: 'newer', error: decoded.error } : corrupt(decoded.error);
  return { status: 'loaded', ...decoded.save };
}

// ---------------------------------------------------------------------------
// Comparing two copies of a game (e.g. a tab running an older build wrote its own copy)
// ---------------------------------------------------------------------------

/** Orders games by how far they have been played: day, then settled days, then recorded transactions. */
export function compareProgress(a: GameState, b: GameState): number {
  return a.day - b.day || a.lastSettledDay - b.lastSettledDay || a.txSeq - b.txSeq;
}

/**
 * JSON with object keys sorted, so equal content compares equal whichever build wrote it (a
 * migrated report lists its fields in a different order than one the current engine writes).
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

function startsWith(list: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.length <= list.length && prefix.every((item, i) => canonical(item) === canonical(list[i]));
}

/**
 * Choices that record no transaction (name, prices, menu, promotion, firing) are the same in
 * `later`. Hiring and upgrades do record one, so `later` may have more staff or upgrades.
 */
function sameUntrackedChoices(earlier: GameState, later: GameState): boolean {
  const laterStaff = new Set(later.staff.map((s) => s.id));
  return (
    earlier.cafeName === later.cafeName &&
    earlier.promotion === later.promotion &&
    earlier.staff.every((s) => laterStaff.has(s.id)) &&
    PRODUCT_IDS.every((id) => earlier.products[id].priceSen === later.products[id].priceSen && earlier.products[id].enabled === later.products[id].enabled)
  );
}

/**
 * True when `earlier` is simply an earlier point of the same game as `later` (nothing in it is
 * missing from `later`), so discarding it loses no play. False for a different game or a
 * diverging branch, including when the history needed to tell has been trimmed.
 */
export function isEarlierStateOf(earlier: GameState, later: GameState): boolean {
  if (earlier.seed !== later.seed || compareProgress(earlier, later) > 0) return false;
  const lastReport = earlier.history[earlier.history.length - 1];
  if (lastReport) {
    const same = later.history.find((r) => r.day === lastReport.day);
    if (!same || canonical(same) !== canonical(lastReport)) return false;
  } else if (earlier.lastSettledDay > 0) {
    return false;
  }
  if (earlier.phase === 'prep') {
    const laterSettledThatDay = later.lastSettledDay >= earlier.day;
    if (earlier.dayTransactions.length > 0) {
      // Preparation spending comes first in that day's transactions.
      const laterTx = laterSettledThatDay ? later.history.find((r) => r.day === earlier.day)?.transactions : later.dayTransactions;
      if (!laterTx || !startsWith(laterTx, earlier.dayTransactions)) return false;
    }
    // While both are preparing the same day, choices that record no transaction must match too.
    if (!laterSettledThatDay && !sameUntrackedChoices(earlier, later)) return false;
  }
  return true;
}

/**
 * Which copy to keep when a tab running an older build saved `theirs` while this tab holds
 * `ours` (that build cannot read this tab's saves, so either may be further ahead). Within one
 * game the further-ahead copy wins (on a tie, theirs: that tab just acted). Between different
 * games, an active café beats a bankrupt one; otherwise this tab's game stays, since the old
 * build never saw it.
 */
export function resolveOldBuildWrite(ours: GameState, theirs: GameState): 'ours' | 'theirs' {
  if (ours.seed === theirs.seed) return compareProgress(theirs, ours) >= 0 ? 'theirs' : 'ours';
  if (ours.status !== 'active' && theirs.status === 'active') return 'theirs';
  return 'ours';
}

// ---------------------------------------------------------------------------
// Copies kept aside for restoring
// ---------------------------------------------------------------------------

/**
 * Up to MAX_KEPT_COPIES saves set aside by this build, newest first. Older builds do not know this
 * key, so unlike BACKUP_KEY (which an older build overwrites whenever it meets a save it cannot
 * read) nothing but this build changes it.
 */
export const COPIES_KEY = 'rlt-cafe-empire/salinan';
export const MAX_KEPT_COPIES = 3;

function readCopyList(storage: StorageLike): unknown[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(COPIES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** A game nobody has played yet: nothing in it is worth restoring. */
function isUntouched(g: GameState): boolean {
  return g.day === 1 && g.phase === 'prep' && g.history.length === 0 && g.dayTransactions.length === 0;
}

/**
 * Keep `game` as a restorable copy, newest first. Copies that are only earlier points of it (or of
 * `current`, the game in play) are dropped first so they never push real progress out; beyond
 * the limit the oldest go. Returns true when the game's play is restorable from the copies
 * (added, or already contained in a later copy).
 */
export function keepCopy(storage: StorageLike | null, game: GameState, now: Date = new Date(), current?: GameState): boolean {
  if (!storage || isUntouched(game) || (current && isEarlierStateOf(game, current))) return false;
  try {
    const copies = readCopyList(storage).flatMap((item) => {
      const decoded = decodeSave(JSON.stringify(item));
      return decoded.ok ? [{ item, game: decoded.save.game }] : [];
    });
    if (copies.some((c) => isEarlierStateOf(game, c.game))) return true;
    const others = copies.filter((c) => !isEarlierStateOf(c.game, game) && !(current && isEarlierStateOf(c.game, current)));
    const envelope: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: now.toISOString(), game };
    storage.setItem(COPIES_KEY, JSON.stringify([envelope, ...others.map((c) => c.item)].slice(0, MAX_KEPT_COPIES)));
    return true;
  } catch {
    return false;
  }
}

/** Remove the oldest kept copy. Returns false when there was none to remove. */
function dropOldestCopy(storage: StorageLike): boolean {
  const list = readCopyList(storage);
  if (list.length === 0) return false;
  try {
    if (list.length === 1) storage.removeItem(COPIES_KEY);
    else storage.setItem(COPIES_KEY, JSON.stringify(list.slice(0, -1)));
    return true;
  } catch {
    try {
      storage.removeItem(COPIES_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

/** Forget a kept copy, wherever it is stored. */
export function discardCopy(storage: StorageLike | null, game: GameState): void {
  if (!storage) return;
  const text = JSON.stringify(game);
  try {
    storage.setItem(COPIES_KEY, JSON.stringify(readCopyList(storage).filter((e) => !(isObj(e) && JSON.stringify(e.game) === text))));
    const legacy = storage.getItem(BACKUP_KEY);
    if (legacy !== null) {
      const decoded = decodeSave(legacy);
      if (decoded.ok && JSON.stringify(decoded.save.game) === text) storage.removeItem(BACKUP_KEY);
    }
  } catch {
    // Nothing else to do: the copy simply stays.
  }
}

/** The save in BACKUP_KEY, if this build can load it. */
export function readLegacyBackup(storage: StorageLike | null): DecodedSave | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(BACKUP_KEY);
    if (text === null) return null;
    const decoded = decodeSave(text);
    return decoded.ok ? decoded.save : null;
  } catch {
    return null;
  }
}

/**
 * Every copy this build can load, newest kept copy first: the kept copies, then BACKUP_KEY (a save
 * moved aside as unreadable — possibly a newer save that an older build could not read).
 */
export function readCopies(storage: StorageLike | null): DecodedSave[] {
  if (!storage) return [];
  const seen = new Set<string>();
  const out: DecodedSave[] = [];
  const add = (save: DecodedSave | null) => {
    if (!save) return;
    const key = canonical(save.game);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(save);
  };
  for (const item of readCopyList(storage)) {
    const decoded = decodeSave(JSON.stringify(item));
    add(decoded.ok ? decoded.save : null);
  }
  add(readLegacyBackup(storage));
  return out;
}

export interface DecodedSave {
  game: GameState;
  savedAt: string | null;
  saveId: string | null;
  migratedFrom: number | null;
}

/** Parse, migrate and validate saved text (from localStorage or an imported file). */
export function decodeSave(text: string): { ok: true; save: DecodedSave } | { ok: false; error: string; newer?: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Data simpanan bukan JSON yang sah.' };
  }
  const migrated = migrateSave(parsed);
  if (!migrated.ok) return { ok: false, error: migrated.error, ...(migrated.newer ? { newer: true } : {}) };
  const validated = validateGameState(migrated.game);
  if (!validated.ok) return { ok: false, error: `Data simpanan tidak sah (${validated.errors.slice(0, 3).join('; ')}).` };
  return {
    ok: true,
    save: {
      game: validated.state,
      savedAt: isObj(parsed) && typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      saveId: isObj(parsed) && typeof parsed.saveId === 'string' ? parsed.saveId : null,
      migratedFrom: migrated.fromVersion === SAVE_SCHEMA_VERSION ? null : migrated.fromVersion,
    },
  };
}

// ---------------------------------------------------------------------------
// Export / import (backup or move a game to another browser or device)
// ---------------------------------------------------------------------------

/** Imported files larger than this are rejected before parsing. Real saves stay well under 1 MB. */
export const MAX_IMPORT_BYTES = 3_000_000;

/** The save as a downloadable JSON file body (same versioned envelope as localStorage). */
export function exportSave(game: GameState, now: Date = new Date()): string {
  const envelope: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: now.toISOString(), game };
  return JSON.stringify(envelope);
}

export function exportFileName(game: GameState): string {
  const slug =
    game.cafeName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'kafe';
  return `cafe-empire-${slug}-hari-${game.day}.json`;
}

export type ImportResult = { ok: true; game: GameState; migratedFrom: number | null } | { ok: false; error: string };

/** Check an imported file before it may replace the current game. */
export function parseImportedSave(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Fail terlalu besar untuk simpanan Café Empire.' };
  if (text.trim().length === 0) return { ok: false, error: 'Fail kosong.' };
  const decoded = decodeSave(text);
  if (!decoded.ok) return { ok: false, error: `Fail ini bukan simpanan Café Empire yang sah. ${decoded.error}` };
  return { ok: true, game: decoded.save.game, migratedFrom: decoded.save.migratedFrom };
}

export type SaveResult = { ok: true; savedAt: string; saveId: string } | { ok: false; error: string };

export function saveGame(
  storage: StorageLike | null,
  game: GameState,
  now: Date = new Date(),
  saveId: string = newSaveId(),
): SaveResult {
  if (!storage) return { ok: false, error: 'Storan pelayar tidak tersedia. Kemajuan tidak dapat disimpan.' };
  // Key order matters: saveId must precede game so peekSaveId can find it cheaply.
  const envelope: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: now.toISOString(), saveId, game };
  const text = JSON.stringify(envelope);
  for (;;) {
    try {
      storage.setItem(SAVE_KEY, text);
      return { ok: true, savedAt: envelope.savedAt, saveId };
    } catch {
      // The current game matters more than kept copies: make room by dropping the oldest one.
      if (!dropOldestCopy(storage)) return { ok: false, error: 'Gagal menyimpan — storan pelayar mungkin penuh atau disekat.' };
    }
  }
}

export function clearSave(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
