import { expect, test } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast, toast } from './helpers';

const ROUTES = [
  '#/utama',
  '#/operasi',
  '#/menu/harga',
  '#/menu/inventori',
  '#/urus/staf',
  '#/urus/naik-taraf',
  '#/urus/objektif',
  '#/kewangan/ringkasan',
  '#/kewangan/laporan',
  '#/kewangan/lejar',
  '#/kewangan/pinjaman',
];

for (const width of [360, 390, 768]) {
  test(`no horizontal overflow and touch targets of at least 40px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ROUTES) {
      await gotoApp(page, route);
      const metrics = await page.evaluate(() => {
        const small = [...document.querySelectorAll<HTMLElement>('button, a, input')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40);
          })
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40));
        return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, small };
      });
      expect(metrics.scroll, `overflow on ${route}`).toBeLessThanOrEqual(metrics.client);
      expect(metrics.small, `small targets on ${route}`).toEqual([]);
    }
  });
}

test('menu shows prices, unit costs, margins and availability', async ({ page }) => {
  await gotoApp(page, '#/menu/harga');
  await expect(page.getByRole('heading', { name: 'Kopi O' })).toBeVisible();
  await expect(page.getByText('Kos bahan').first()).toBeVisible();
  await expect(page.getByText('Resipi: 1 sukatan biji kopi + 2 sukatan susu segar')).toBeVisible();
  await expect(page.getByText('Margin %').first()).toBeVisible();
  await page.getByRole('switch', { name: 'Croissant dalam menu' }).click();
  await expect(toast(page)).toContainText('Croissant dikeluarkan daripada menu');
  await expect(page.getByText('Tiada dalam menu').first()).toBeVisible();
});

test('inventory shows low-stock warnings and blocks purchases the café cannot afford', async ({ page }) => {
  await gotoApp(page, '#/menu/inventori');
  await expect(page.getByText('Habis').first()).toBeVisible();
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    save.game.cashSen = 500;
    save.game.dayStart.cashSen = 500;
    localStorage.setItem(key, JSON.stringify(save));
  }, 'rlt-cafe-empire/save');
  await page.reload();
  await expect(page.getByText(/Tunai tidak mencukupi — perlu/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Beli \d+/ }).first()).toBeDisabled();
});

test('business screen: hire with confirmation, then see wages and capacity', async ({ page }) => {
  await gotoApp(page, '#/urus/staf');
  await page.getByRole('button', { name: 'Ambil', exact: true }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Kapasiti kafe bertambah daripada 8 kepada');
  await dialog.getByRole('button', { name: 'Ambil bekerja' }).click();
  await expect(toast(page)).toContainText('kini sebahagian pasukan');
  await expect(page.getByText('2/2')).toBeVisible();
  await page.getByRole('tab', { name: 'Objektif' }).click();
  await expect(page.getByText('Pasukan berkembang')).toBeVisible();
});

test('finance and reports: charts, report history sheet and ledger', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  await gotoApp(page, '#/kewangan/ringkasan');
  await expect(page.getByLabel('Carta hasil jualan dan untung bersih harian')).toBeVisible();
  await page.getByRole('button', { name: 'Lihat sebagai jadual' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('tab', { name: 'Laporan' }).click();
  await page.getByRole('button', { name: /Hari\s*1/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Laporan Hari 1' });
  await expect(sheet).toContainText('Kos barang dijual');
  await sheet.getByRole('button', { name: 'Tutup' }).click();
  await page.getByRole('tab', { name: 'Lejar' }).click();
  await expect(page.getByText(/Jualan Kopi O ×\d+/)).toBeVisible();
});

test('the end-of-day result card can be shared as an image', async ({ page }) => {
  await gotoApp(page);
  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Kongsi kad' }).click()]);
  expect(download.suggestedFilename()).toBe('cafe-empire-hari-1.png');
});
