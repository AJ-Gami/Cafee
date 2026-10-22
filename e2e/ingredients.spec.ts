import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openCafeAndSkip, restockToForecast, toast } from './helpers';

const card = (page: Page, name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });

async function buy(page: Page, ingredient: string, qty: number, unit: string): Promise<void> {
  const c = card(page, ingredient);
  await c.getByRole('button', { name: String(qty), exact: true }).click();
  await c.getByRole('button', { name: `Beli ${qty} ${unit}` }).click();
  await expect(toast(page)).toContainText(`Berjaya membeli ${qty} ${unit} ${ingredient}`);
}

test('stock is kept as ingredients: what each product can make follows its recipe', async ({ page }) => {
  await gotoApp(page, '#/menu/inventori');
  for (const name of ['Biji kopi', 'Susu segar', 'Serbuk teh', 'Doh croissant']) await expect(card(page, name)).toContainText('Habis');
  await expect(card(page, 'Susu segar')).toContainText('Untuk Latte (2), Teh Ais (1)');
  const servings = page.locator('section').filter({ hasText: 'Hidangan boleh dibuat' });
  const row = (product: string) => servings.getByRole('listitem').filter({ hasText: product });

  // Milk alone makes nothing; with ten coffee measures, ten milk measures make five lattes.
  await buy(page, 'Susu segar', 10, 'sukatan');
  await expect(row('Latte')).toContainText('1 biji kopi + 2 susu segar');
  await expect(row('Latte').getByText('0 cawan', { exact: true })).toBeVisible();
  await buy(page, 'Biji kopi', 10, 'sukatan');
  await expect(row('Latte').getByText('5 cawan', { exact: true })).toBeVisible();
  await expect(row('Kopi O').getByText('10 cawan', { exact: true })).toBeVisible();
  await expect(row('Teh Ais').getByText('0 gelas', { exact: true })).toBeVisible();

  await restockToForecast(page);
  await openCafeAndSkip(page, 1);
  const ingredients = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Bahan', exact: true }) });
  await expect(ingredients).toContainText(/Biji kopi\s*baki \d+ sukatan/);
  await expect(ingredients).toContainText(/dibeli \d+ · digunakan \d+/);
  await expect(page.getByText('Semakan laporan: seimbang')).toBeVisible();
});
