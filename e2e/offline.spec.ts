import { expect, test } from '@playwright/test';
import { gotoApp, navButton, openCafeAndSkip, readSave, restockToForecast } from './helpers';

test('after the first visit the game keeps working offline, charts included', async ({ page, context }) => {
  await gotoApp(page);
  // Wait until the service worker has installed (precached every built file) and is active.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await restockToForecast(page);
  await openCafeAndSkip(page, 1);

  // Truly offline: the page AND the service worker lose the network.
  await context.setOffline(true);
  await context.route('**', (route) => route.abort('internetdisconnected'));
  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Laporan Hari 1' })).toBeVisible();

  // The lazily loaded charts chunk was precached too.
  await navButton(page, /Kewangan/).click();
  await expect(page.getByLabel('Carta hasil jualan dan untung bersih harian')).toBeVisible();
  await expect(page.getByText('Carta tidak dapat dimuatkan')).toHaveCount(0);

  // Keep playing offline: progress is saved locally as usual.
  await navButton(page, /Operasi/).click();
  await page.getByRole('button', { name: 'Mulakan Hari 2' }).click();
  await expect(page.getByRole('heading', { name: 'Persediaan Hari 2' })).toBeVisible();
  expect((await readSave(page))?.game.day).toBe(2);
  expect(failed).toEqual([]);
});

test('offline, other pages on the same origin are not answered with the game', async ({ page, context }) => {
  await gotoApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await context.route('**', (route) => route.abort('internetdisconnected'));
  await expect(page.goto('/halaman-lain/')).rejects.toThrow();
});

test('the web app manifest and icons are served for installation', async ({ page, request }) => {
  await gotoApp(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('./manifest.webmanifest');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.short_name).toBe('Café Empire');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(`/${icon.src}`)).status()).toBe(200);
  }
});
