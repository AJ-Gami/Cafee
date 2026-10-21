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
 *   v2 (current): envelope `{ schemaVersion: 2, savedAt, game }`, all money in
 *       integer sen, transaction ledger, daily reports and stats.
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
  game: GameState;
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

/** v1 prototype save -> v2 game state. */
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
    dayStart: { cashSen, inventorySen: inventoryValue(products) },
    stats: { ...base.stats, daysCompleted: day - 1 },
  };
}

export type MigrationResult = { ok: true; game: unknown; fromVersion: number } | { ok: false; error: string };

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
    return { ok: false, error: 'Simpanan ini daripada versi permainan yang lebih baharu.' };
  }
  if (version === 1) {
    if (!isObj(game)) return { ok: false, error: 'Simpanan v1 rosak.' };
    game = migrateV1toV2(game);
    version = 2;
  }
  // Future migrations: if (version === 2) { game = migrateV2toV3(game); version = 3; }
  if (version !== SAVE_SCHEMA_VERSION) return { ok: false, error: 'Migrasi simpanan tidak lengkap.' };
  return { ok: true, game, fromVersion };
}

// ---------------------------------------------------------------------------
// Load / save / clear
// ---------------------------------------------------------------------------

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; game: GameState; savedAt: string | null; migratedFrom: number | null }
  | { status: 'corrupt'; error: string; backedUp: boolean }
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return corrupt('Data simpanan bukan JSON yang sah.');
  }
  const migrated = migrateSave(parsed);
  if (!migrated.ok) return corrupt(migrated.error);
  const validated = validateGameState(migrated.game);
  if (!validated.ok) return corrupt(`Data simpanan tidak sah (${validated.errors.slice(0, 3).join('; ')}).`);

  const savedAt = isObj(parsed) && typeof parsed.savedAt === 'string' ? parsed.savedAt : null;
  return {
    status: 'loaded',
    game: validated.state,
    savedAt,
    migratedFrom: migrated.fromVersion === SAVE_SCHEMA_VERSION ? null : migrated.fromVersion,
  };
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

export function saveGame(storage: StorageLike | null, game: GameState, now: Date = new Date()): SaveResult {
  if (!storage) return { ok: false, error: 'Storan pelayar tidak tersedia. Kemajuan tidak dapat disimpan.' };
  const envelope: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: now.toISOString(), game };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(envelope));
    return { ok: true, savedAt: envelope.savedAt };
  } catch {
    return { ok: false, error: 'Gagal menyimpan — storan pelayar mungkin penuh atau disekat.' };
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
