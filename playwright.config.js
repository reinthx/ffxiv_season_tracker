// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    // Dedicated port so a running `npm run dev` (wrangler, :8787) — which
    // serves a stale dist/ — can't be silently reused by the test server.
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
  },
  // Against a live URL (E2E_BASE_URL set), skip the local static server.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'node scripts/serve-docs.js 8788',
          port: 8788,
          reuseExistingServer: true,
        },
      }),
});
