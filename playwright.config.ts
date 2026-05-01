import { defineConfig } from '@playwright/test'

/**
 * Playwright config for V5 visual verification.
 * Server is expected to be already running on http://localhost:3002
 * (start it once before running these tests).
 */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 30_000,
  reporter: 'list',
  workers: 1,
  use: {
    headless: true,
    baseURL: 'http://localhost:3002',
    ignoreHTTPSErrors: true
  }
})
