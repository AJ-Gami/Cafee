import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast } from './helpers';

test('the report that ends a week shows its summary, and past weeks are listed in Finance', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoApp(page);
  for (let day = 1; day <= 7; day++) {
    await restockToForecast(page);
    await openCafeAndSkip(page, day);
    const weekCard = page.getByRole('region', { name: 'Ringkasan Minggu 1' });
    if (day < 7) {
      await expect(weekCard).toHaveCount(0);
      await page.getByRole('button', { name: `Mulakan Hari ${day + 1}` }).click();
    } else {
      await expect(weekCard).toContainText('Minggu 1 selesai!');
      await expect(weekCard).toContainText('Hari 1–7 · Isnin–Ahad');
      await expect(weekCard).toContainText('Hari untung');
    }
  }

  await gotoApp(page, '#/kewangan/laporan');
  await page.getByRole('tab', { name: 'Mingguan' }).click();
  await page.getByRole('button', { name: /Mgg\s*1/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Ringkasan Minggu 1' });
  await expect(sheet).toContainText('Pelanggan dilayan');
  await expect(sheet).not.toContainText('Sedang berjalan');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
