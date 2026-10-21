import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, readSave, restockToForecast, toast } from './helpers';

test('export downloads the current save and import restores it after a reset', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Eksport simpanan' }).click()]);
  expect(download.suggestedFilename()).toBe('cafe-empire-kopi-kita-hari-1.json');
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.schemaVersion).toBe(2);
  expect(exported.game.history).toHaveLength(1);
  await expect(page.getByText(/dimuat turun/)).toBeVisible();

  // Start over, then bring the exported game back.
  await page.getByRole('button', { name: 'Set semula permainan' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ya, padam & mula semula' }).click();
  expect((await readSave(page))?.game.history).toHaveLength(0);

  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await page.getByLabel('Pilih fail simpanan untuk diimport').setInputFiles(path);
  const confirm = page.getByRole('alertdialog', { name: 'Gantikan permainan semasa?' });
  await expect(confirm).toContainText('Hari 1');
  await confirm.getByRole('button', { name: 'Import & gantikan' }).click();
  await expect(toast(page)).toContainText('Simpanan diimport');
  await page.reload();
  const restored = await readSave(page);
  expect(restored?.game.history).toHaveLength(1);
  expect(restored?.game.phase).toBe('closed');
});

test('importing a file that is not a save shows an error and changes nothing', async ({ page }) => {
  await gotoApp(page);
  const before = await readSave(page);
  await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
  await page.getByLabel('Pilih fail simpanan untuk diimport').setInputFiles({
    name: 'bukan-simpanan.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByRole('alert')).toContainText('bukan simpanan Café Empire yang sah');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect((await readSave(page))?.game).toEqual(before?.game);
});
