import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast } from './helpers';

test('the getting-started guide leads a new player through the first day and can be hidden and shown again', async ({ page }) => {
  await gotoApp(page);
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Selamat datang, usahawan!' }) });
  await expect(card.getByRole('progressbar', { name: 'Kemajuan panduan' })).toHaveAttribute('aria-valuenow', '0');

  // Step 1 takes the player to the inventory, where the hint explains it.
  await card.getByRole('button', { name: 'Pergi: Beli stok bahan' }).click();
  await expect(page.getByRole('tab', { name: /Inventori/, selected: true })).toBeVisible();
  await expect(page.getByText('Panduan 1/5: Beli stok bahan')).toBeVisible();
  await restockToForecast(page);
  await expect(page.getByText('Panduan 1/5: Beli stok bahan')).toHaveCount(0);

  // Step 2 is shown where the café is opened; step 3 once the report is up.
  await gotoApp(page, '#/operasi');
  await expect(page.getByText('Panduan 2/5: Buka kafe')).toBeVisible();
  await openCafeAndSkip(page, 1);
  await expect(page.getByText('Panduan 3/5: Baca laporan hari')).toBeVisible();
  await gotoApp(page);
  await expect(page.getByRole('heading', { name: 'Panduan bermula' })).toBeVisible();
  await expect(page.getByText('2 daripada 5 langkah selesai.')).toBeVisible();

  // Hidden: gone from every screen, also after a reload.
  await page.getByRole('button', { name: 'Sembunyikan panduan' }).click();
  await expect(page.getByRole('heading', { name: 'Panduan bermula' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Panduan bermula' })).toHaveCount(0);
  await gotoApp(page, '#/operasi');
  await expect(page.getByText('Panduan 3/5: Baca laporan hari')).toHaveCount(0);

  // Shown again from the settings.
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await page.getByRole('button', { name: 'Tunjuk panduan bermula' }).click();
  await expect(page.getByText('Panduan 3/5: Baca laporan hari')).toBeVisible();
});
