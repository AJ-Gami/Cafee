import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, readSave, restockToForecast, SAVE_KEY, toast } from './helpers';

test('open a second branch, run it for a day, then close it', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoApp(page, '#/urus/cawangan');
  await expect(page.getByText('Dibuka pada Tahap 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka di Tahap 3' }).first()).toBeDisabled();

  // Reach level 3 with cash to spare (as a café that has met three big objectives would).
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    save.game.cashSen = 2_000_000;
    save.game.dayStart.cashSen = 2_000_000;
    save.game.completedObjectives = [
      { id: 'cash_25000', day: 1 },
      { id: 'revenue_1200', day: 1 },
      { id: 'rep_90', day: 1 },
    ];
    localStorage.setItem(key, JSON.stringify(save));
  }, SAVE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Buka cawangan di Kampus' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('RM6,000.00 ditolak daripada tunai anda serta-merta');
  await dialog.getByRole('button', { name: 'Buka cawangan' }).click();
  await expect(toast(page)).toContainText('Cawangan Kampus dibuka!');
  await expect(page.getByRole('heading', { name: 'Cawangan Kampus' })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah barista cawangan' }).click();
  await expect(toast(page)).toContainText('2 barista');

  // The restock plan and the checklist include the branch.
  await restockToForecast(page);
  await gotoApp(page, '#/operasi');
  await expect(page.getByText('Cawangan Kampus: 2 barista')).toBeVisible();
  await openCafeAndSkip(page, 1);
  const branchCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cawangan Kampus' }) });
  await expect(branchCard).toContainText('Sumbangan cawangan');
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
  expect((await readSave(page))?.game.history[0]).toMatchObject({ branch: { location: 'kampus', baristas: 2 } });

  // Next day: yesterday's result is on the branch screen; closing writes off its book value.
  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await gotoApp(page, '#/urus/cawangan');
  await expect(page.getByText('Hari 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup cawangan' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('dihapus kira');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Tutup cawangan' }).click();
  await expect(toast(page)).toContainText('Cawangan Kampus ditutup');
  await expect(page.getByRole('button', { name: 'Buka cawangan di Kampus' })).toBeVisible();
  await restockToForecast(page);
  await openCafeAndSkip(page, 2);
  await expect(page.getByText('Hapus kira cawangan ditutup')).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
});
