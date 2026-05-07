import { test, expect } from '@playwright/test'

test.describe('V5.2 E2E slice', () => {
  test('healthz responds OK', async ({ request }) => {
    const r = await request.get('/healthz')
    expect(r.ok()).toBeTruthy()
    const t = (await r.text()).trim()
    expect(t.startsWith('OK')).toBeTruthy()
  })

  test('settings page shows App preferences', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('App preferences', { exact: false })).toBeVisible({ timeout: 30_000 })
  })

  test('app-settings JSON when unauthenticated', async ({ request }) => {
    const r = await request.get('/api/app-settings')
    expect(r.ok()).toBeTruthy()
    const j = await r.json()
    expect(j.success).toBe(true)
    expect(j.data).toBeTruthy()
  })
})
