import { expect, test, type Page } from '@playwright/test';
import {
  BACKUP_KEY,
  COPIES_KEY,
  gotoApp,
  openCafeAndSkip,
  readSave,
  restockToForecast,
  SAVE_KEY,
  SCHEMA_VERSION,
  toast,
  writeSaveAsOtherTab,
  type StoredSave,
} from './helpers';

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

type Loose = Record<string, any>;

/**
 * Write `game` as an older build would: schema `version`, without the fields later versions added.
 * Before v7 there was no branch. Before v6, stock was held per product: ingredient stock is moved onto products keeping its value
 * (milk and tea as teh ais), and reports carry their spoilage on product lines. Transactions are
 * kept as they are, so the same play compares equal in both builds.
 */
async function writeAsOldBuild(page: Page, game: StoredSave['game'], saveId: string, version: 2 | 3 | 4 | 5 | 6 = 2): Promise<void> {
  const g = structuredClone(game) as unknown as Loose;
  g.schemaVersion = version;
  // Added in v7 (a second branch). These tests open no branch.
  delete g.branch;
  delete g.pendingWriteOffSen;
  delete g.stats.branchesOpened;
  for (const r of g.history as Loose[]) {
    delete r.branch;
    delete r.expenses.writeOffSen;
  }
  if (version <= 5) {
    // Added in v6 (ingredient stock).
    const ing = g.ingredients as Record<'kopi' | 'susu' | 'teh' | 'pastri', { stock: number; stockValueSen: number }>;
    delete g.ingredients;
    for (const id of Object.keys(g.products)) g.products[id] = { ...g.products[id], unitCostSen: 100, stock: 0, stockValueSen: 0 };
    Object.assign(g.products.kopi_o, { stock: ing.kopi.stock, stockValueSen: ing.kopi.stockValueSen });
    Object.assign(g.products.teh_ais, { stock: Math.min(ing.susu.stock, ing.teh.stock), stockValueSen: ing.susu.stockValueSen + ing.teh.stockValueSen });
    Object.assign(g.products.croissant, { stock: ing.pastri.stock, stockValueSen: ing.pastri.stockValueSen });
    const legacyProduct: Record<string, string> = { kopi: 'kopi_o', susu: 'teh_ais', teh: 'teh_ais', pastri: 'croissant' };
    for (const r of g.history as Loose[]) {
      for (const line of r.products as Loose[]) Object.assign(line, { spoiledUnits: 0, spoiledValueSen: 0, closingStock: 0 });
      for (const l of r.ingredients as Loose[]) {
        const line = (r.products as Loose[]).find((p) => p.productId === legacyProduct[l.ingredientId]);
        line!.spoiledUnits += l.spoiled;
        line!.spoiledValueSen += l.spoiledValueSen;
      }
      delete r.ingredients;
    }
  }
  if (version <= 4) {
    // Added in v5 (fixed assets). These tests buy no upgrades, so no depreciation is in the totals.
    delete g.assets;
    delete g.dayStart.assetsSen;
    for (const r of g.history) {
      delete r.openingAssetsSen;
      delete r.closingAssetsSen;
      delete r.expenses.depreciationSen;
    }
  }
  if (version <= 3) {
    // Added in v4 (sales goals).
    delete g.goal;
    delete g.stats.goalsMet;
    delete g.stats.holidayGoalsMet;
    delete g.stats.perfectWeekends;
    for (const r of g.history) delete r.goal;
  }
  if (version === 2) {
    // Added in v3 (loans).
    delete g.loan;
    delete g.dayStart.debtSen;
    delete g.stats.loansRepaid;
  }
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SAVE_KEY, JSON.stringify({ schemaVersion: version, savedAt: new Date().toISOString(), saveId, game: g })] as const,
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
  expect((await readSave(a))?.schemaVersion).toBe(SCHEMA_VERSION);
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

for (const version of [2, 3, 4, 5, 6] as const) {
  test(`progress made further ahead in an older-build tab (v${version}) is adopted, not reverted`, async ({ context }) => {
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
      ([key, game, version]) => localStorage.setItem(key, JSON.stringify({ schemaVersion: version, savedAt: new Date().toISOString(), saveId: 'rewind', game })),
      [SAVE_KEY, day1, SCHEMA_VERSION] as const,
    );
    await expect(a.getByRole('heading', { name: 'Persediaan Hari 1' })).toBeVisible();
    await writeAsOldBuild(old, day2, 'old-ahead', version);
    await expect(a.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
    await expect(a.getByText(/Kemajuan dikemas kini daripada tab yang menjalankan versi lama permainan ini \(Kopi Kita, Hari 2\)/)).toBeVisible();
    // Not written back: the old build can still read what it saved, and nothing needed setting aside.
    const stored = await readSave(a);
    expect(stored?.schemaVersion).toBe(version);
    expect(stored?.game.day).toBe(2);
    expect(await keptCopies(a)).toEqual([]);
    // Playing on here saves in this build's format, with the fields the old build lacked.
    await restockToForecast(a);
    const upgraded = (await readSave(a)) as (StoredSave & { game: { goal: unknown; assets: unknown[]; ingredients: Loose } }) | null;
    expect(upgraded?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded?.game).toMatchObject({ day: 2, goal: null, assets: [], dayStart: { assetsSen: 0 }, stats: { goalsMet: 0 } });
    expect(upgraded?.game.ingredients.kopi.stock).toBeGreaterThan(0);
    // Reports from before ingredient stock keep their per-product lines.
    expect((upgraded?.game.history[0] as Loose | undefined)?.ingredients === null).toBe(version <= 5);
    expect(upgraded?.game).toMatchObject({ branch: null, pendingWriteOffSen: 0 });
  });
}

test('a loadable backup copy can be restored from settings', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page); // some play, so the copy is worth restoring
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

test('menu changes in an older-build tab do not pile up copies of the same game', async ({ context }) => {
  const a = await context.newPage();
  const old = await context.newPage();
  await gotoApp(a);
  await restockToForecast(a);
  const base = (await readSave(a))!.game;
  await gotoApp(old);
  // The older build writes its own line of play: first the same state, then two menu switches
  // (which record no transaction).
  await writeAsOldBuild(old, base, 'old-1');
  await expect(a.getByText(/Kemajuan dikemas kini daripada tab yang menjalankan versi lama/)).toBeVisible();
  for (const [i, id] of (['latte', 'croissant'] as const).entries()) {
    const g = structuredClone(base);
    g.products.latte!.enabled = false;
    if (id === 'croissant') g.products.croissant!.enabled = false;
    await writeAsOldBuild(old, g, `old-menu-${i}`);
    await expect.poll(async () => (await readSave(a))?.saveId).toBe(`old-menu-${i}`);
  }
  await expect(a.getByText(/Permainan tab ini sebelumnya/)).toHaveCount(0);
  expect(await keptCopies(a)).toEqual([]);
});

test('a bankrupt café set aside is not announced as progress further ahead', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    Object.assign(save.game, { seed: 4243, day: 5, lastSettledDay: 4, status: 'bankrupt' });
    localStorage.setItem('rlt-cafe-empire/save-rosak', JSON.stringify(save));
  }, SAVE_KEY);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
  await expect(page.getByText(/Salinan kemajuan yang lebih jauh ditemui/)).toHaveCount(0, { timeout: 1_000 });
});
