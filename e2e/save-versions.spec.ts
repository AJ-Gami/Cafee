import { expect, test, type Page } from '@playwright/test';
import { BACKUP_KEY, COPIES_KEY, gotoApp, openCafeAndSkip, readSave, restockToForecast, SAVE_KEY, toast, writeSaveAsOtherTab, type StoredSave } from './helpers';

/** Rewrite the stored save as a different schema version, as another build of the game would. */
async function writeAsVersion(page: Page, version: number, mutate: (game: Record<string, unknown>) => void): Promise<void> {
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
  // The whole game was replaced: focus moves to the new screen's heading so the change is announced.
  await expect(a.getByRole('heading', { name: 'Versi permainan ini sudah lama' })).toBeFocused();
  expect(await a.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(written);
});

/** Write `game` as an older build would: the v2 format, without the fields v3 added. */
async function writeAsOldBuild(page: Page, game: StoredSave['game'], saveId: string): Promise<void> {
  const g = structuredClone(game) as unknown as Record<string, unknown> & { dayStart: Record<string, unknown>; stats: Record<string, unknown> };
  g.schemaVersion = 2;
  delete g.loan;
  delete g.dayStart.debtSen;
  delete g.stats.loansRepaid;
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SAVE_KEY, JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), saveId, game: g })] as const,
  );
}

/** The copies set aside by the current build (newest first). */
const keptCopies = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as { game: StoredSave['game'] }[], COPIES_KEY);

test('an older-build tab that is behind cannot replace newer progress; a diverging copy is kept aside', async ({ context }) => {
  const a = await context.newPage();
  const old = await context.newPage();
  await gotoApp(a);
  await restockToForecast(a);
  const day1 = (await readSave(a))!.game;
  await openCafeAndSkip(a, 1);
  await a.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await expect(a.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
  const ours = (await readSave(a))!;
  await gotoApp(old);

  // The old tab still holds day 1 exactly: nothing in it is missing from day 2, so nothing is kept aside.
  await writeAsOldBuild(old, day1, 'old-1');
  await expect(a.getByText('Tab versi lama dikesan')).toBeVisible();
  await expect(a.getByText(/kemajuan yang kurang \(Hari 1\)\. Permainan anda \(Hari 2\) dikekalkan\. Muat semula/)).toBeVisible();
  expect((await readSave(a))?.game.day).toBe(2);
  expect((await readSave(a))?.schemaVersion).toBe(3);
  expect(await keptCopies(a)).toEqual([]);

  // Day 1 played differently in the old tab (it bought more stock): kept aside and restorable.
  const branch = structuredClone(day1) as unknown as { cashSen: number; dayTransactions: unknown[] };
  branch.cashSen -= 500;
  branch.dayTransactions.push({ id: 'old-tx', day: 1, type: 'stock_purchase', amountSen: -500, label: 'Belian tab lama', productId: 'latte', quantity: 2 });
  await writeAsOldBuild(old, branch as unknown as StoredSave['game'], 'old-2');
  await expect(a.getByText(/salinan tab itu boleh dipulihkan dalam Tetapan/)).toBeVisible();
  expect((await readSave(a))?.game.cashSen).toBe(ours.game.cashSen);
  expect((await keptCopies(a))[0]?.game.cashSen).toBe(day1.cashSen - 500);
  await a.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await expect(a.getByRole('button', { name: 'Pulihkan salinan sandaran: Kopi Kita, Hari 1' })).toBeVisible();
});

test('progress made further ahead in an older-build tab is adopted, not reverted', async ({ context }) => {
  const a = await context.newPage();
  const old = await context.newPage();
  await gotoApp(a);
  await restockToForecast(a);
  const day1 = (await readSave(a))!.game;
  await openCafeAndSkip(a, 1);
  await a.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  const day2 = (await readSave(a))!.game;
  // Tab A goes back to day 1 (another current tab wrote it); then the old-build tab saves day 2.
  await gotoApp(old);
  await old.evaluate(
    ([key, game]) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 3, savedAt: new Date().toISOString(), saveId: 'rewind', game })),
    [SAVE_KEY, day1] as const,
  );
  await expect(a.getByRole('heading', { name: 'Persediaan Hari 1' })).toBeVisible();
  await writeAsOldBuild(old, day2, 'old-ahead');
  await expect(a.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
  await expect(a.getByText(/Kemajuan dikemas kini daripada tab yang menjalankan versi lama permainan ini \(Kopi Kita, Hari 2\)/)).toBeVisible();
  // Not written back: the old build can still read what it saved, and nothing needed setting aside.
  const stored = await readSave(a);
  expect(stored?.schemaVersion).toBe(2);
  expect(stored?.game.day).toBe(2);
  expect(await keptCopies(a)).toEqual([]);
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
  await page.getByRole('button', { name: 'Pulihkan salinan sandaran: Kopi Sandaran, Hari 1' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Pulihkan & gantikan' }).click();
  await expect(toast(page)).toContainText('Salinan sandaran dipulihkan');
  await expect(page.locator('header')).toContainText('RM6,543.00');
  await expect(page.getByRole('button', { name: 'Pulihkan salinan sandaran' })).toHaveCount(0);
  // The button that opened the confirmation is gone; focus stays inside the open settings sheet.
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  expect((await readSave(page))?.game.cafeName).toBe('Kopi Sandaran');
});

test('a kept copy can be removed from settings, and its start-up notice goes with it', async ({ page }) => {
  await gotoApp(page);
  // Another café, further ahead, moved aside into the old backup key (as an older build does).
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    const g = save.game;
    Object.assign(g, { seed: 4242, cafeName: 'WWWWWWWWWWWWWWWWWWWWWWWW', day: 5, lastSettledDay: 4 });
    localStorage.setItem('rlt-cafe-empire/save-rosak', JSON.stringify(save));
  }, SAVE_KEY);
  await page.reload();
  await expect(page.getByText(/Salinan kemajuan yang lebih jauh ditemui \(W+, Hari 5\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Tetapan simpanan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tetapan' });
  const remove = sheet.getByRole('button', { name: /Buang salinan sandaran: W+, Hari 5/ });
  await remove.scrollIntoViewIfNeeded();
  // A 24-letter name wraps instead of widening the sheet.
  expect(await sheet.evaluate((el) => [...el.querySelectorAll('*')].every((n) => n.getBoundingClientRect().right <= window.innerWidth + 0.5))).toBe(true);
  await remove.click();
  const confirm = page.getByRole('alertdialog', { name: 'Buang salinan sandaran ini?' });
  expect(await confirm.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await confirm.getByRole('button', { name: 'Buang salinan' }).click();
  await expect(page.getByText('Salinan sandaran dalam pelayar ini')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), COPIES_KEY)).toBe('[]');
  // The button that opened the confirmation is gone: focus stays in the sheet, in both directions.
  const inSheet = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  expect(await inSheet()).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await inSheet()).toBe(true);
  await page.keyboard.press('Tab');
  expect(await inSheet()).toBe(true);
  await sheet.getByRole('button', { name: 'Tutup' }).click();
  await expect(page.getByText(/Salinan kemajuan yang lebih jauh ditemui/)).toHaveCount(0);
});

test('a sheet keeps scrolling with the keyboard after its text is clicked', async ({ page }) => {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tetapan' });
  await sheet.getByRole('heading', { name: 'Nama kafe' }).click();
  const scrollTop = () => sheet.evaluate((el) => el.querySelector<HTMLElement>('.overflow-y-auto')?.scrollTop ?? 0);
  const before = await scrollTop();
  await page.keyboard.press('PageDown');
  // The key press itself must scroll (clicking may already have scrolled a little).
  await expect.poll(scrollTop).toBeGreaterThan(before + 100);
});
