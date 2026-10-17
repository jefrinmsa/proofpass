import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests',
  workers: 1,
  timeout: 300000,
  expect: { timeout: 15000 },
  use: {
    actionTimeout: 15000,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: { args: ['--js-flags=--max-old-space-size=8192'] },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  reporter: 'list',
  outputDir: '.local/browser-results',
});
