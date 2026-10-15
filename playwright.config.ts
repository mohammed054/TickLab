import { defineConfig } from '@playwright/test';

// E2E for the Electron app (docs/08 §8.1-8.2): both windows, seeded DB.
// No test may call the live internet (docs/08 §8.1); live polling still runs
// in the background, so every spec scopes its assertions to seeded rows
// (unique E2E symbols/mints) instead of exact table counts. See helpers.ts.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['*.spec.ts'],
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {},
});
