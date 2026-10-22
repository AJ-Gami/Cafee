import { expect, test } from '@playwright/test';
import { gotoApp, navButton, openCafeAndSkip, restockToForecast } from './helpers';

const GOAL_TITLE = /Sasaran (hujung minggu|cuti umum)/;

test('a week of play: weekend goals, the week summary on day 7, and past weeks in Finance', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoApp(page);
  for (let day = 1; day <= 7; day++) {
    await restockToForecast(page);
    if (day === 5) {
      await navButton(page, /Operasi/).click();
      await expect(page.getByText('Esok hujung minggu')).toBeVisible();
    }
    if (day === 6) {
      // The goal is fixed when the day starts and shown on the dashboard and before opening.
      await gotoApp(page);
      await expect(page.getByRole('heading', { name: GOAL_TITLE })).toBeVisible();
      await navButton(page, /Operasi/).click();
      await expect(page.getByRole('heading', { name: GOAL_TITLE })).toBeVisible();
      await expect(page.getByText(/purata jualan 5 hari lepas \(RM[\d,.]+\) \+ (20|35)%/)).toBeVisible();
      // The replay tracks revenue against the goal.
      await page.getByRole('button', { name: 'Buka kafe — Hari 6' }).click();
      const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Buka juga' });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await expect(page.getByRole('progressbar', { name: GOAL_TITLE })).toBeVisible();
      await page.getByRole('button', { name: 'Langkau ke laporan' }).click();
      await expect(page.getByRole('heading', { name: 'Laporan Hari 6' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Kad keputusan Hari 6' })).toContainText(
        /Sasaran (hujung minggu|cuti umum) RM[\d,.]+: (dicapai!|tidak dicapai \(kurang RM[\d,.]+\))/,
      );
    } else {
      await openCafeAndSkip(page, day);
    }
    const weekCard = page.getByRole('region', { name: 'Ringkasan Minggu 1' });
    if (day < 7) {
      await expect(weekCard).toHaveCount(0);
      await page.getByRole('button', { name: `Mulakan Hari ${day + 1}` }).click();
    } else {
      await expect(weekCard).toContainText('Minggu 1 selesai!');
      await expect(weekCard).toContainText('Hari 1–7 · Isnin–Ahad');
      await expect(weekCard).toContainText('Hari untung');
      await expect(weekCard).toContainText(/Sasaran jualan dicapai\s*\d\/\d/);
    }
  }

  // The week's result card is shared as its own image and text, next to the day's.
  const weekCard = page.getByRole('region', { name: 'Ringkasan Minggu 1' });
  const [download] = await Promise.all([page.waitForEvent('download'), weekCard.getByRole('button', { name: 'Kongsi kad mingguan' }).click()]);
  expect(download.suggestedFilename()).toBe('cafe-empire-minggu-1.png');
  await weekCard.getByRole('button', { name: 'Salin teks mingguan' }).click();
  await expect(weekCard.getByText('Ringkasan disalin ke papan klip.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('— Minggu 1 (Hari 1–7)');
  expect(copied).toMatch(/Sasaran jualan dicapai: \d\/\d/);
  expect(copied).toContain('data simulasi permainan');

  await gotoApp(page, '#/kewangan/laporan');
  await page.getByRole('tab', { name: 'Mingguan' }).click();
  await expect(page.getByRole('button', { name: /Mgg\s*1/ })).toContainText(/sasaran \d\/\d/);
  await page.getByRole('button', { name: /Mgg\s*1/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Ringkasan Minggu 1' });
  await expect(sheet).toContainText('Pelanggan dilayan');
  await expect(sheet).not.toContainText('Sedang berjalan');
  await expect(sheet.getByRole('button', { name: 'Kongsi kad mingguan' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
