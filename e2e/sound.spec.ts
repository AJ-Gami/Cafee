import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast } from './helpers';

declare global {
  interface Window {
    notesPlayed: number;
  }
}

test('actions and the day replay make sounds, which can be switched off and stay off', async ({ page }) => {
  // Count the notes started, without changing how they sound.
  await page.addInitScript(() => {
    window.notesPlayed = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args: Parameters<OscillatorNode['start']>) {
      window.notesPlayed += 1;
      return start.apply(this, args);
    };
  });
  await gotoApp(page);
  await restockToForecast(page);
  await expect.poll(() => page.evaluate(() => window.notesPlayed)).toBeGreaterThan(0);

  // The replay rings the door bell and shows customers at the counter.
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: /Operasi/ }).click();
  const before = await page.evaluate(() => window.notesPlayed);
  await page.getByRole('button', { name: 'Buka kafe — Hari 1' }).click();
  await expect.poll(() => page.evaluate(() => window.notesPlayed)).toBeGreaterThan(before);
  await expect(page.locator('svg g.motion-safe\\:animate-fade-up').first()).toBeAttached();
  await page.getByRole('button', { name: 'Langkau ke laporan' }).click();

  // Switched off: no more sounds, also after a reload.
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  const toggle = page.getByRole('switch', { name: 'Kesan bunyi' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await restockToForecast(page);
  await openCafeAndSkip(page, 2);
  expect(await page.evaluate(() => window.notesPlayed)).toBe(0);
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await expect(page.getByRole('switch', { name: 'Kesan bunyi' })).toHaveAttribute('aria-checked', 'false');
});
