/**
 * Visual suite covering every dashboard route.
 *
 * Scope clarification: V5 Sprint 2 only redesigned `/`. Every other page still
 * renders the V4 visual shell on top of v5-core.css tokens. This spec captures
 * each page in light + dark themes at desktop + mobile widths so we can see the
 * *current* state honestly. The pass bar is the same for all pages:
 *   - HTTP 200, page loads
 *   - no horizontal scroll
 *   - no uncaught JS errors / console.error during render
 *   - the navigation chrome (sidebar/topbar OR V4 sidebar) is on screen
 * It does NOT enforce the V5 hero/cards on V4 pages.
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'v5-s2-redo-screenshots', 'all-pages')
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const PAGES = [
  { route: '/', slug: 'overview' },
  { route: '/portfolio', slug: 'portfolio' },
  { route: '/this-month', slug: 'this-month' },
  { route: '/india', slug: 'india' },
  { route: '/tax-calendar', slug: 'tax-calendar' },
  { route: '/intelligence', slug: 'intelligence' },
  { route: '/library', slug: 'library' },
  { route: '/reports', slug: 'reports' },
  { route: '/alerts', slug: 'alerts' },
  { route: '/finances', slug: 'finances' },
  { route: '/settings', slug: 'settings' },
  { route: '/onboarding', slug: 'onboarding' },
  { route: '/backtest', slug: 'backtest' }
] as const

const SIZES = [
  { name: 'desktop-1400', width: 1400, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 }
] as const

const THEMES = ['light', 'dark'] as const

// Onboarding redirects when no profile exists — we want to capture it directly
// and not chase the redirect into / again. The other pages may also redirect to
// /onboarding via /api/profile/status; we accept that and capture whatever the
// browser actually shows (this is a faithful snapshot, not a contract).

for (const page of PAGES) {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      test(`Visual ${page.slug} ${size.name} ${theme}`, async ({ page: pw }) => {
        await pw.setViewportSize({ width: size.width, height: size.height })
        await pw.addInitScript((t: string) => {
          try {
            localStorage.setItem('artha-theme-preference', t)
          } catch {}
        }, theme)

        const errors: string[] = []
        pw.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
        pw.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
        })

        const resp = await pw.goto(page.route, { waitUntil: 'domcontentloaded' })
        // Allow async data loads + layout settle
        await pw.waitForLoadState('networkidle').catch(() => {})
        await pw.waitForTimeout(800)

        const filename = `${theme}-${size.name}-${page.slug}.png`
        await pw.screenshot({
          path: path.join(SCREENSHOT_DIR, filename),
          fullPage: true
        })

        // Page returned a real response.
        expect(resp, `${page.route} returned a response`).not.toBeNull()
        const status = resp!.status()
        // Some pages legitimately 304 from the disk cache, or 302 to /onboarding.
        // Treat anything in the 200-399 range as healthy.
        expect(status, `${page.route} HTTP status ${status}`).toBeGreaterThanOrEqual(200)
        expect(status, `${page.route} HTTP status ${status}`).toBeLessThan(400)

        // No horizontal scroll at any width.
        const hasHScroll = await pw.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1
        )
        expect(
          hasHScroll,
          `Horizontal scroll on ${page.route} at ${size.name}/${theme}`
        ).toBe(false)

        // Theme actually applied.
        const resolved = await pw.evaluate(() =>
          document.documentElement.getAttribute('data-theme')
        )
        expect(resolved, `data-theme=${theme} on ${page.route}`).toBe(theme)

        // Page chrome present: V5 sidebar, V4 sidebar, OR onboarding wizard
        // (the wizard intentionally has no sidebar).
        const hasChrome = await pw.evaluate(() => {
          const v5 = document.querySelector('aside.sidebar')
          const v4 = document.querySelector('.app aside.sidebar, .sidebar nav')
          const wizard = document.querySelector('.onb-wrap, .onb-dots, .onb-inner')
          return !!(v5 || v4 || wizard)
        })
        expect(hasChrome, `Page chrome present on ${page.route}`).toBe(true)

        // No uncaught JS errors — this is the bar that previously failed (Decimal.toFixed).
        expect(
          errors,
          `Browser errors on ${page.route} ${size.name}/${theme}:\n  ${errors.join('\n  ')}`
        ).toEqual([])
      })
    }
  }
}
