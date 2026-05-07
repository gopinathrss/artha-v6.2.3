import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'v5-s2-redo-screenshots')
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const SIZES = [
  { name: 'desktop-1400', width: 1400, height: 900 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 }
] as const

const THEMES = ['light', 'dark'] as const

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`Overview ${size.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })

      // Set theme via localStorage before any page script runs.
      await page.addInitScript((t: string) => {
        try {
          localStorage.setItem('pie-theme-preference', t)
        } catch {}
      }, theme)

      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
      })

      await page.goto('/', { waitUntil: 'networkidle' })

      // Allow late-arriving renders (allocation bar width transition, etc.).
      await page.waitForTimeout(700)

      // Make sure the live theme matches what we asked for.
      const resolved = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      expect(resolved, `data-theme attribute is "${theme}"`).toBe(theme)

      const filename = `${theme}-${size.name}.png`
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, filename),
        fullPage: true
      })

      // 1) No horizontal scroll at any width.
      const hasHScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      )
      expect(hasHScroll, `Horizontal scroll at ${size.name}/${theme}`).toBe(false)

      // 2) Hero net worth visible and positioned correctly.
      const networthEl = page.locator('#hero-networth')
      await expect(networthEl).toBeVisible()
      const box = await networthEl.boundingBox()
      expect(box, 'Hero networth has bounding box').not.toBeNull()
      if (size.width >= 769) {
        expect(box!.x, `Hero starts after sidebar at ${size.name}`).toBeGreaterThanOrEqual(220)
      } else {
        expect(box!.x, `Hero near left edge on mobile`).toBeLessThan(60)
      }

      // 3) Topbar title visible.
      await expect(page.locator('.topbar-page-title')).toBeVisible()

      // 4) Active nav item is "Overview".
      const active = page.locator('.sidebar-nav-item a.active').first()
      // On mobile the sidebar is offscreen but still in the DOM.
      await expect(active).toHaveAttribute('href', '/')

      // 5) Critical content blocks present.
      await expect(page.locator('.overview-hero')).toBeVisible()
      await expect(page.locator('#alloc-bar-current')).toBeVisible()
      await expect(page.locator('#holdings-tbody tr').first()).toBeVisible({ timeout: 5_000 })

      // 6) No JS errors leaked through during render.
      expect(
        errors,
        `Browser errors on ${size.name}/${theme}:\n  ${errors.join('\n  ')}`
      ).toEqual([])
    })
  }
}
