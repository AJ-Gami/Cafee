import { defineConfig } from '@playwright/test';

const PORT = 4174;

/**
 * End-to-end tests run against the production build served by `vite preview`,
 * at the 360px mobile viewport the game is designed for.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    locale: 'ms-MY',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-mobile-360', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
