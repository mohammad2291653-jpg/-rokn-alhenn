import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_REPORT ?? 'artifacts/playwright-results.json' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? (process.env.CI ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3000'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.CI ? [{
    command: 'npm run dev -- --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next-qa', BETTER_AUTH_URL: 'http://127.0.0.1:3001', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3001' },
  }, {
    command: 'npm run dev -- --port 3002',
    url: 'http://127.0.0.1:3002/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next-free-preview-qa',
      BETTER_AUTH_URL: 'http://127.0.0.1:3002', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3002',
      DATABASE_URL: process.env.PREVIEW_TEST_DATABASE_URL ?? '',
      PREVIEW_ACCESS_TOKEN: process.env.PREVIEW_TEST_ACCESS_TOKEN ?? '',
      RENDER_FREE_PREVIEW: 'true', COMMERCIAL_LAUNCH_APPROVED: 'false', ALLOW_INDEXING: 'false', STORAGE_DRIVER: 'disabled',
    },
  }] : undefined,
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-iphone-emulation', use: { ...devices['iPhone 13'] } },
    { name: 'chromium-android-emulation', use: { ...devices['Pixel 7'] } },
    { name: 'chromium-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } } },
  ],
});
