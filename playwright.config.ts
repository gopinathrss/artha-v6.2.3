import { defineConfig } from '@playwright/test'

/**
 * Playwright config for V5 visual verification.
 * Starts the API server automatically so routes match the workspace (avoids
 * stale long-lived dev servers missing new `/api/*` handlers).
 */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 30_000,
  reporter: 'list',
  workers: 1,
  webServer: {
    command: 'node --env-file=.env ./node_modules/tsx/dist/cli.mjs src/api/server.ts',
    url: 'http://127.0.0.1:3002/healthz',
    timeout: 120_000,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1'
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:3002',
    ignoreHTTPSErrors: true
  }
})
