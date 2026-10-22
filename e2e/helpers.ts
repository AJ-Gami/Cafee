import { expect, type Locator, type Page } from '@playwright/test';

export const SAVE_KEY = 'rlt-cafe-empire/save';
export const BACKUP_KEY = 'rlt-cafe-empire/save-rosak';
export const COPIES_KEY = 'rlt-cafe-empire/salinan';
/** The save schema version this build writes. */
export const SCHEMA_VERSION = 7;

/** Minimal shape of the stored save used by assertions. */
export interface StoredSave {
  schemaVersion: number;
  savedAt: string;
  saveId?: string;
  game: {
    day: number;
    phase: 'prep' | 'closed';
    status: 'active' | 'bankrupt';
    cashSen: number;
    reputation: number;
    cafeName: string;
    seed: number;
    history: { day: number; netProfitSen: number }[];
    staff: { id: string; name: string }[];
    dayStart: { cashSen: number; inventorySen: number; debtSen: number; staffNames?: string[] };
    stats: { negativeCashStreak: number };
    products: Record<string, { priceSen: number; enabled: boolean }>;
    ingredients: Record<string, { stock: number; stockValueSen: number; unitCostSen: number }>;
  };
}

export async function gotoApp(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
}

export function navButton(page: Page, label: RegExp): Locator {
  return page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: label });
}

export function toast(page: Page): Locator {
  return page.locator('button', { hasText: 'Ketik untuk tutup' });
}

export async function readSave(page: Page): Promise<StoredSave | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSave) : null;
  }, SAVE_KEY);
}

/** Rewrite the stored save as if another tab had written it (new saveId), then optionally reload. */
export async function writeSaveAsOtherTab(page: Page, mutate: (game: StoredSave['game']) => void, saveId = 'other-tab'): Promise<void> {
  const save = await readSave(page);
  if (!save) throw new Error('no save to rewrite');
  mutate(save.game);
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SAVE_KEY, JSON.stringify({ schemaVersion: save.schemaVersion, savedAt: save.savedAt, saveId, game: save.game })] as const,
  );
}

/** Buy stock up to today's forecast via the one-tap restock. */
export async function restockToForecast(page: Page): Promise<void> {
  await gotoApp(page, '#/menu/inventori');
  await page.getByRole('button', { name: /Isi semula ikut anggaran/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Beli semua' }).click();
  await expect(toast(page)).toContainText('Berjaya membeli stok');
}

/** Open the café for the current day and skip the replay to the report. */
export async function openCafeAndSkip(page: Page, day: number): Promise<void> {
  await navButton(page, /Operasi/).click();
  await page.getByRole('button', { name: `Buka kafe — Hari ${day}` }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Buka juga' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.getByRole('button', { name: 'Langkau ke laporan' }).click();
  await expect(page.getByRole('heading', { name: `Laporan Hari ${day}` })).toBeVisible();
}
