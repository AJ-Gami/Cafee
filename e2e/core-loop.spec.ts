import { expect, test } from '@playwright/test';
import { gotoApp, navButton, openCafeAndSkip, readSave, restockToForecast, toast } from './helpers';

test('a new player starts with RM5,000, reputation 50 and an empty stockroom', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('header')).toContainText('RM5,000.00');
  await expect(page.getByText('Selamat datang, usahawan!')).toBeVisible();
  await expect(page.getByText('50/100')).toBeVisible();
  await navButton(page, /Menu/).click();
  await expect(page.getByRole('heading', { name: 'Menu & Stok' })).toBeVisible();
});

test('full day: buy stock, set a price, open, review a reconciled report, refresh, next day', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);

  // Price editing through the product-specific field.
  await gotoApp(page, '#/menu/harga');
  await page.getByLabel('Harga jualan Latte').fill('7.20');
  await page.getByRole('button', { name: /Simpan harga/ }).click();
  await expect(toast(page)).toContainText('Harga Latte kini RM7.20.');

  await openCafeAndSkip(page, 1);
  await expect(page.getByText('Untung & rugi')).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();

  const settled = await readSave(page);
  expect(settled?.game.phase).toBe('closed');
  expect(settled?.game.history).toHaveLength(1);
  expect(settled?.game.products.latte?.priceSen).toBe(720);

  // Progress survives a refresh: the report is still there and the day is not re-run.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Laporan Hari 1' })).toBeVisible();
  await expect(page.getByText('Langkau ke laporan')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await expect(page.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
  expect((await readSave(page))?.game.day).toBe(2);
});

test('rapid repeated taps on "Buka kafe" settle the day exactly once', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await navButton(page, /Operasi/).click();
  const open = page.getByRole('button', { name: 'Buka kafe — Hari 1' });
  await open.dblclick();
  await page.getByRole('button', { name: 'Langkau ke laporan' }).click();
  await expect(page.getByRole('heading', { name: 'Laporan Hari 1' })).toBeVisible();
  const save = await readSave(page);
  expect(save?.game.history).toHaveLength(1);
});

test('opening without stock asks for confirmation first', async ({ page }) => {
  await gotoApp(page, '#/operasi');
  await page.getByRole('button', { name: 'Buka kafe — Hari 1' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Buka kafe walaupun belum bersedia?');
  await dialog.getByRole('button', { name: 'Batal' }).click();
  expect((await readSave(page))?.game.phase).toBe('prep');
});

test('leaving the replay and coming back shows the report instead of replaying', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await navButton(page, /Operasi/).click();
  await page.getByRole('button', { name: 'Buka kafe — Hari 1' }).click();
  await expect(page.getByText('Langkau ke laporan')).toBeVisible();
  await navButton(page, /Utama/).click();
  await navButton(page, /Operasi/).click();
  await expect(page.getByRole('heading', { name: 'Laporan Hari 1' })).toBeVisible();
  await expect(page.getByText('Langkau ke laporan')).toHaveCount(0);
});
