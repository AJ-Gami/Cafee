import { expect, test } from '@playwright/test';
import { BACKUP_KEY, gotoApp, openCafeAndSkip, readSave, restockToForecast, SAVE_KEY, SCHEMA_VERSION, toast, writeSaveAsOtherTab } from './helpers';

test('a malformed save is backed up and a new game starts with a notice', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), SAVE_KEY);
  await page.reload();
  await expect(page.getByText('Simpanan rosak dipulihkan')).toBeVisible();
  await expect(page.locator('header')).toContainText('RM5,000.00');
  expect(await page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY)).toBe('{broken');
});

test('a v1 prototype save is migrated on load', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        seed: 42,
        day: 4,
        cash: 4321.5,
        reputation: 61,
        products: [{ id: 'latte', price: 7.5, cost: 2.2, stock: 12, enabled: true }],
        staff: [{ id: 'a', name: 'Aiman', role: 'barista', wage: 90 }],
        upgrades: ['signage'],
      }),
    );
  }, SAVE_KEY);
  await page.reload();
  await expect(page.getByText('Simpanan versi 1 telah dikemas kini ke format terkini.')).toBeVisible();
  await expect(page.locator('header')).toContainText('RM4,321.50');
  expect((await readSave(page))?.schemaVersion).toBe(SCHEMA_VERSION);
});

test('reset requires confirmation and then clears all progress', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await page.getByRole('button', { name: 'Set semula permainan' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('tidak boleh dibatalkan');
  await confirm.getByRole('button', { name: 'Batal' }).click();
  expect((await readSave(page))?.game.history).toHaveLength(1);

  await page.getByRole('button', { name: 'Set semula permainan' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ya, padam & mula semula' }).click();
  await expect(page.locator('header')).toContainText('RM5,000.00');
  await page.reload();
  const save = await readSave(page);
  expect(save?.game.day).toBe(1);
  expect(save?.game.history).toHaveLength(0);
});

test('bankruptcy ends the game and restarting asks for confirmation', async ({ page }) => {
  await gotoApp(page);
  await writeSaveAsOtherTab(page, (g) => {
    g.cashSen = -80_000;
    g.dayStart.cashSen = -80_000;
    g.stats.negativeCashStreak = 2;
  });
  await page.reload();
  await expect(page.getByText('Amaran tunai negatif')).toBeVisible();
  await openCafeAndSkip(page, 1);
  const gameOver = page.getByRole('alertdialog', { name: 'Kafe anda muflis' });
  await expect(gameOver).toBeVisible();
  await expect(gameOver.getByRole('button', { name: 'Lihat laporan dahulu' })).toBeFocused();
  await gameOver.getByRole('button', { name: 'Mulakan kafe baharu' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Padam dan mula semula?' });
  await confirm.getByRole('button', { name: 'Ya, mula kafe baharu' }).click();
  await expect(page.locator('header')).toContainText('RM5,000.00');
  await expect(toast(page)).toContainText('Permainan baharu dimulakan');
});
