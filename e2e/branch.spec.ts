import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, readSave, restockToForecast, SAVE_KEY, toast } from './helpers';

test('open two branches, upgrade one, run them for a day, then close one', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoApp(page, '#/urus/cawangan');
  await expect(page.getByText('Cawangan ke-1 dibuka pada Tahap 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka di Tahap 3' }).first()).toBeDisabled();

  // Reach level 4 with cash to spare (as a café that has met its big objectives would).
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    save.game.cashSen = 4_000_000;
    save.game.dayStart.cashSen = 4_000_000;
    save.game.completedObjectives = ['cash_25000', 'revenue_1200', 'rep_90', 'serve_1000', 'profit_streak_5', 'cash_8000', 'rep_70'].map((id) => ({ id, day: 1 }));
    localStorage.setItem(key, JSON.stringify(save));
  }, SAVE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Buka cawangan di Kampus' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('RM6,000.00 ditolak daripada tunai anda serta-merta');
  await dialog.getByRole('button', { name: 'Buka cawangan' }).click();
  await expect(toast(page)).toContainText('Cawangan Kampus dibuka!');
  const kampus = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cawangan Kampus' }) });
  await expect(kampus).toBeVisible();
  await page.getByRole('button', { name: 'Tambah barista cawangan Kampus' }).click();
  await expect(toast(page)).toContainText('2 barista');

  // Its own upgrade.
  await kampus.getByRole('button', { name: /Beli Papan tanda cawangan untuk Kampus/ }).click();
  await expect(dialog).toContainText('selama 90 hari');
  await dialog.getByRole('button', { name: 'Beli naik taraf' }).click();
  await expect(toast(page)).toContainText('Papan tanda cawangan dipasang di cawangan Kampus');
  await expect(kampus.getByText('Dimiliki')).toBeVisible();

  // A second branch.
  await page.getByRole('button', { name: 'Buka cawangan di Pejabat' }).click();
  await dialog.getByRole('button', { name: 'Buka cawangan' }).click();
  await expect(toast(page)).toContainText('Cawangan Pejabat dibuka!');
  await expect(page.getByRole('heading', { name: 'Cawangan Pejabat' })).toBeVisible();

  // The restock plan covers every branch's delivery, and the checklist checks each one.
  await restockToForecast(page);
  await gotoApp(page, '#/urus/cawangan');
  await expect(kampus.getByText('Stok cawangan pagi ini')).toBeVisible();
  await expect(page.getByText('Stor pusat tidak cukup untuk semua penghantaran')).toHaveCount(0);
  await gotoApp(page, '#/operasi');
  await expect(page.getByText('Cawangan Kampus: 2 barista')).toBeVisible();
  await expect(page.getByText('Cawangan Pejabat: 1 barista')).toBeVisible();
  await openCafeAndSkip(page, 1);
  for (const name of ['Cawangan Kampus', 'Cawangan Pejabat']) {
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name }) });
    await expect(card).toContainText('Sumbangan cawangan');
  }
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
  expect((await readSave(page))?.game.history[0]).toMatchObject({
    branches: [
      { location: 'kampus', baristas: 2 },
      { location: 'pejabat', baristas: 1 },
    ],
  });

  // Next day: yesterday's result is on the branch screen; closing one writes off its book value.
  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await gotoApp(page, '#/urus/cawangan');
  await expect(kampus.getByText('Hari 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup cawangan Pejabat' }).click();
  await expect(dialog).toContainText('dihapus kira');
  await dialog.getByRole('button', { name: 'Tutup cawangan' }).click();
  await expect(toast(page)).toContainText('Cawangan Pejabat ditutup');
  await expect(page.getByRole('heading', { name: 'Cawangan Pejabat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buka cawangan di Pejabat' })).toBeVisible();
  await expect(kampus).toBeVisible();
  await restockToForecast(page);
  await openCafeAndSkip(page, 2);
  await expect(page.getByText('Hapus kira cawangan ditutup')).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
  expect((await readSave(page))?.game.branches.map((b) => b.location)).toEqual(['kampus']);
});
