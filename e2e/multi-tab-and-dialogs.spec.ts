import { expect, test, type Page } from '@playwright/test';
import { gotoApp, navButton, openCafeAndSkip, readSave, restockToForecast, toast, writeSaveAsOtherTab } from './helpers';

test.describe('two tabs on one save', () => {
  test('a second tab follows progress made in the first', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await gotoApp(a);
    await gotoApp(b, '#/operasi');
    await restockToForecast(a);
    await openCafeAndSkip(a, 1);
    await expect(b.getByRole('heading', { name: 'Laporan Hari 1' })).toBeVisible();
    await expect(b.getByText(/dikemas kini daripada tab lain/).first()).toBeVisible();
  });

  test('a stale tab adopts newer progress instead of acting on old data', async ({ page }) => {
    await gotoApp(page);
    await restockToForecast(page);
    await navButton(page, /Operasi/).click();
    // Another tab saved newer progress; this page gets no storage event for writes made from itself.
    await writeSaveAsOtherTab(page, (g) => {
      g.cashSen = 999_900;
      g.dayStart.cashSen = 999_900;
    });
    await page.getByRole('button', { name: 'Buka kafe — Hari 1' }).click();
    await expect(toast(page)).toContainText('Tindakan dibatalkan');
    await expect(page.locator('header')).toContainText('RM9,999.00');
    const save = await readSave(page);
    expect(save?.saveId).toBe('other-tab');
    expect(save?.game.history).toHaveLength(0);
  });

  test('a stale tab cannot overwrite newer progress with a manual save', async ({ page }) => {
    await gotoApp(page);
    await writeSaveAsOtherTab(page, (g) => {
      g.cashSen = 777_700;
      g.dayStart.cashSen = 777_700;
    });
    await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
    await page.getByRole('button', { name: 'Simpan sekarang' }).click();
    await expect(toast(page)).toContainText('Tindakan dibatalkan');
    await expect(page.getByText('Disimpan dalam pelayar ini.')).toHaveCount(0);
    expect((await readSave(page))?.game.cashSen).toBe(777_700);
  });
});

test.describe('dialogs and toasts', () => {
  async function buttonIsReachable(page: Page, name: string): Promise<boolean> {
    const box = await page.getByRole('alertdialog').getByRole('button', { name }).boundingBox();
    if (!box) return false;
    return page.evaluate(
      ([x, y, label]) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit?.closest('button') && hit.closest('button')?.textContent?.trim() === label;
      },
      [box.x + box.width / 2, box.y + box.height / 2, name] as const,
    );
  }

  test('opening a confirmation clears any toast so its buttons are never covered', async ({ page }) => {
    await gotoApp(page, '#/urus/staf');
    await page.getByRole('button', { name: 'Ambil', exact: true }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ambil bekerja' }).click();
    await expect(toast(page)).toBeVisible();
    await page.getByRole('button', { name: /^Berhentikan / }).first().click();
    await expect(toast(page)).toHaveCount(0);
    expect(await buttonIsReachable(page, 'Berhentikan')).toBe(true);
    expect(await buttonIsReachable(page, 'Batal')).toBe(true);
  });

  test('Escape closes only the top-most dialog', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
    await page.getByRole('button', { name: 'Set semula permainan' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Tetapan' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Tetapan' })).toHaveCount(0);
  });

  test('a toast over the settings sheet only dismisses itself when tapped', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Tetapan & simpanan' }).click();
    await page.getByLabel('Nama kafe').fill('Kopi Baru');
    await page.locator('form').getByRole('button', { name: 'Simpan' }).click();
    await expect(toast(page)).toContainText('Kopi Baru');
    const closeBox = await page.getByRole('dialog', { name: 'Tetapan' }).getByRole('button', { name: 'Tutup' }).boundingBox();
    const toastBox = await toast(page).boundingBox();
    expect(closeBox && toastBox && toastBox.y + toastBox.height <= closeBox.y).toBe(true);
    await toast(page).click();
    await expect(toast(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Tetapan' })).toBeVisible();
  });
});
