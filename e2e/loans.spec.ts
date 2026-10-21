import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, readSave, restockToForecast, SAVE_KEY, toast } from './helpers';

test('take a bank loan, pay installments at each close, then settle it early', async ({ page }) => {
  await gotoApp(page, '#/kewangan/pinjaman');
  const mikro = page.locator('section', { has: page.getByRole('heading', { name: 'Pinjaman Mikro' }) });
  await expect(mikro).toContainText('RM2,100.00');
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Pinjaman Pengembangan' }) }).getByRole('button')).toBeDisabled();
  await mikro.getByRole('button', { name: 'Mohon pinjaman' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Ambil Pinjaman Mikro?' });
  await expect(confirm).toContainText('Ansuran tetap dicaj walaupun tunai tidak cukup');
  await confirm.getByRole('button', { name: 'Ambil pinjaman' }).click();
  await expect(toast(page)).toContainText('diterima');
  await expect(page.locator('header')).toContainText('RM7,000.00');
  await expect(page.getByRole('button', { name: /Batalkan pinjaman/ })).toBeVisible();
  await expect(mikro.getByRole('button', { name: 'Mohon pinjaman' })).toBeDisabled();

  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  await expect(page.getByText('Pinjaman diterima', { exact: true })).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();

  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await openCafeAndSkip(page, 2);
  await expect(page.getByText('Faedah pinjaman', { exact: true })).toBeVisible();
  await expect(page.getByText('Bayaran balik pokok pinjaman', { exact: true })).toBeVisible();
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
  const afterDay2 = await readSave(page);
  expect((afterDay2?.game as unknown as { loan: { paymentsMade: number } }).loan.paymentsMade).toBe(1);

  await page.getByRole('button', { name: 'Mulakan Hari 3' }).click();
  await gotoApp(page, '#/kewangan/pinjaman');
  await page.getByRole('button', { name: /Lunaskan sekarang \(RM1,810\.00\)/ }).click();
  await page.getByRole('alertdialog', { name: 'Lunaskan pinjaman sekarang?' }).getByRole('button', { name: 'Lunaskan' }).click();
  await expect(toast(page)).toContainText('dilunaskan');
  await expect(toast(page)).toContainText('Bebas hutang');
  await expect(page.getByText('Pinjaman aktif')).toHaveCount(0);
  expect((await readSave(page))?.game as unknown as { loan: unknown }).toMatchObject({ loan: null });
});

test('a save from the previous version (v2) is migrated on load', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    const g = save.game;
    g.schemaVersion = 2;
    g.cashSen = 432_100;
    g.dayStart.cashSen = 432_100;
    delete g.loan;
    delete g.dayStart.debtSen;
    delete g.stats.loansRepaid;
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, savedAt: save.savedAt, game: g }));
  }, SAVE_KEY);
  await page.reload();
  await expect(page.getByText('Simpanan versi 2 telah dikemas kini ke format terkini.')).toBeVisible();
  await expect(page.locator('header')).toContainText('RM4,321.00');
  const save = await readSave(page);
  expect(save?.schemaVersion).toBe(3);
  expect(save?.game.dayStart.debtSen).toBe(0);
});
