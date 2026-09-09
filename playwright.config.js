// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
  },
  // Against a live URL (E2E_BASE_URL set), skip the local static server.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'node scripts/serve-docs.js 8787',
          port: 8787,
          reuseExistingServer: true,
        },
      }),
});
