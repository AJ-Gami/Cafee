import { expect, test } from '@playwright/test';
import { BACKUP_KEY, gotoApp, readSave, restockToForecast, SAVE_KEY, toast, writeSaveAsOtherTab } from './helpers';

/** Rewrite the stored save as a different schema version, as another build of the game would. */
async function writeAsVersion(page: import('@playwright/test').Page, version: number, mutate: (game: Record<string, unknown>) => void): Promise<void> {
  const save = await readSave(page);
  if (!save) throw new Error('no save');
  const game = save.game as unknown as Record<string, unknown>;
  mutate(game);
  game.schemaVersion = version;
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SAVE_KEY, JSON.stringify({ schemaVersion: version, savedAt: save.savedAt, saveId: `v${version}-tab`, game })] as const,
  );
}

test('a save from a newer version is never overwritten: the game asks for a reload instead', async ({ page }) => {
  await gotoApp(page);
  await writeAsVersion(page, 99, (g) => {
    g.cashSen = 1_234_500;
  });
  const before = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Versi permainan ini sudah lama' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Muat semula' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY)).toBeNull();
});

test('a running tab that sees a newer-version save stops instead of overwriting it', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await gotoApp(a);
  await gotoApp(b);
  await writeAsVersion(b, 99, (g) => {
    g.cashSen = 1_234_500;
  });
  const written = await b.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  await expect(a.getByRole('heading', { name: 'Versi permainan ini sudah lama' })).toBeVisible();
  expect(await a.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(written);
});

test('a tab running an older build cannot replace newer progress', async ({ context }) => {
  const a = await context.newPage();
  const old = await context.newPage();
  await gotoApp(a);
  await restockToForecast(a);
  const ours = await readSave(a);
  await gotoApp(old);
  // The old build writes its stale progress in the v2 format (no loan fields, different cash).
  await writeAsVersion(old, 2, (g) => {
    g.cashSen = 111_100;
    (g.dayStart as Record<string, unknown>).cashSen = 111_100;
    delete g.loan;
    delete (g.dayStart as Record<string, unknown>).debtSen;
    delete (g.stats as Record<string, unknown>).loansRepaid;
  });
  await expect(a.getByText('Tab versi lama dikesan')).toBeVisible();
  await expect(a.locator('header')).toContainText(`RM${((ours?.game.cashSen ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  const restored = await readSave(a);
  expect(restored?.schemaVersion).toBe(3);
  expect(restored?.game.cashSen).toBe(ours?.game.cashSen);
  // A safety copy of the kept progress is in the backup key.
  const backup = await a.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), BACKUP_KEY);
  expect(backup?.game.cashSen).toBe(ours?.game.cashSen);
});

test('a loadable backup copy can be restored from settings', async ({ page }) => {
  await gotoApp(page);
  await writeSaveAsOtherTab(page, (g) => {
    g.cashSen = 654_300;
    g.dayStart.cashSen = 654_300;
    g.cafeName = 'Kopi Sandaran';
  });
  // Move that save into the backup key and start over, as an older build does with a save it cannot read.
  await page.evaluate(([key, backupKey]) => {
    localStorage.setItem(backupKey, localStorage.getItem(key) ?? '');
    localStorage.removeItem(key);
  }, [SAVE_KEY, BACKUP_KEY] as const);
  await page.reload();
  await expect(page.locator('header')).toContainText('RM5,000.00');
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await expect(page.getByText('Kopi Sandaran, Hari 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pulihkan salinan sandaran' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Pulihkan & gantikan' }).click();
  await expect(toast(page)).toContainText('Salinan sandaran dipulihkan');
  await expect(page.locator('header')).toContainText('RM6,543.00');
  await expect(page.getByRole('button', { name: 'Pulihkan salinan sandaran' })).toHaveCount(0);
  expect((await readSave(page))?.game.cafeName).toBe('Kopi Sandaran');
});
