import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast, toast } from './helpers';

test('an upgrade is a fixed asset: paid for in cash, then depreciated at every close', async ({ page }) => {
  await gotoApp(page, '#/urus/naik-taraf');
  const machine = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Mesin Espreso Dwi-Kepala' }) });
  await machine.getByRole('button', { name: 'Beli' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('susut nilai kira-kira RM20.00 setiap kali kafe ditutup selama 90 hari');
  await dialog.getByRole('button', { name: 'Beli naik taraf' }).click();
  await expect(toast(page)).toContainText('dipasang');
  await expect(machine).toContainText('Nilai buku RM1,800.00 · susut nilai RM20.00 sehari, 90 hari lagi');
  await expect(page.locator('header')).toContainText('RM3,200.00');

  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  await expect(page.getByText('Susut nilai aset (bukan tunai)')).toBeVisible();
  await expect(page.getByText(/Aset tetap \(nilai buku\): RM0\.00 → RM1,780\.00/)).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();

  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await gotoApp(page, '#/urus/naik-taraf');
  await expect(machine).toContainText('Nilai buku RM1,780.00 · susut nilai RM20.00 sehari, 89 hari lagi');
});
