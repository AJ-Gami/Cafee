import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast } from './helpers';

const inTopDialog = (page: Page) =>
  page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
    return !!dialogs.at(-1)?.contains(document.activeElement);
  });

async function openWeek(page: Page): Promise<void> {
  await gotoApp(page, '#/kewangan/laporan');
  await page.getByRole('tab', { name: 'Mingguan' }).click();
  await page.getByRole('button', { name: /Mgg\s*1/ }).click();
  await expect(page.getByRole('dialog', { name: 'Ringkasan Minggu 1' })).toBeVisible();
}

test.describe('keyboard use of sheets and dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await restockToForecast(page);
    await openCafeAndSkip(page, 1);
  });

  test('Tab after clicking text in a sheet without controls stays in the sheet', async ({ page }) => {
    await openWeek(page);
    await page.getByRole('dialog', { name: 'Ringkasan Minggu 1' }).getByText('Hari untung').click();
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await inTopDialog(page), `after ${key}`).toBe(true);
    }
  });

  test('a sheet with no controls can be scrolled with the keyboard alone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 600 });
    await openWeek(page);
    const region = page.getByRole('region', { name: 'Ringkasan Minggu 1' }).first();
    expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(region).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test('every section of a past report can be opened with the keyboard', async ({ page }) => {
    await gotoApp(page, '#/kewangan/laporan');
    await page.getByRole('button', { name: /Hari\s*1/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Laporan Hari 1' });
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => (document.activeElement?.textContent ?? '').startsWith('Transaksi ('));
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');
    await expect(sheet.getByText(/Jualan Kopi O ×\d+/)).toBeVisible();
    expect(await inTopDialog(page)).toBe(true);
  });

  test('after a confirmation disables the button that opened it, focus moves to the main content', async ({ page }) => {
    await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
    await gotoApp(page, '#/menu/inventori');
    const opener = page.getByRole('button', { name: /Isi semula ikut anggaran/ });
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Beli semua' }).press('Enter');
    await expect(page.getByRole('button', { name: /Stok sudah ikut anggaran/ })).toBeDisabled();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
  });
});
