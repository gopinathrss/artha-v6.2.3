import { defineConfig } from '@playwright/test'

/** API + HTML smoke (V5.2); separate from `tests/visual` layout checks. */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
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
