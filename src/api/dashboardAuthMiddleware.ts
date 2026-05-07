import type { Express, NextFunction, Request, Response } from 'express'
import { isDashboardAuthEnabled, parseDashboardSessionCookie } from '../lib/dashboardAuth'

const DASHBOARD_HTML_PATHS = new Set([
  '/',
  '/onboarding',
  '/this-month',
  '/finances',
  '/india',
  '/portfolio',
  '/accounts',
  '/tax-calendar',
  '/alerts',
  '/reports',
  '/settings',
  '/intelligence',
  '/library',
  '/backtest',
  '/patterns',
  '/profile',
  '/help'
])

function isAssetPath(p: string): boolean {
  return (
    p.startsWith('/scripts/') ||
    p.startsWith('/styles/') ||
    p.startsWith('/assets/') ||
    p.startsWith('/vendor/') ||
    p.startsWith('/charts/')
  )
}

/** Redirect browser navigation to dashboard pages when not signed in (runs before static). */
export function registerDashboardHtmlAuthGate(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isDashboardAuthEnabled()) return next()
    if (req.method !== 'GET') return next()
    if (req.path.startsWith('/api/')) return next()
    if (isAssetPath(req.path)) return next()
    if (
      req.path === '/login.html' ||
      req.path === '/login' ||
      req.path === '/reset-password.html' ||
      req.path === '/forgot-password.html'
    )
      return next()
    if (req.path === '/healthz') return next()
    const accept = String(req.headers.accept || '')
    const looksHtml = accept.includes('text/html') || accept === '*/*' || accept === ''
    if (!looksHtml) return next()
    if (!DASHBOARD_HTML_PATHS.has(req.path)) return next()
    if (!parseDashboardSessionCookie(req.headers.cookie)) {
      res.redirect(302, '/login.html?next=' + encodeURIComponent(req.originalUrl || '/'))
      return
    }
    next()
  })
}

/** JSON APIs require session cookie when dashboard auth is enabled. */
export function registerDashboardApiAuthGate(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isDashboardAuthEnabled()) return next()
    if (!req.path.startsWith('/api/')) return next()
    if (req.path.startsWith('/api/auth/')) return next()
    if (req.path.startsWith('/api/oauth/google/mail/')) return next()
    if (parseDashboardSessionCookie(req.headers.cookie)) return next()
    res.status(401).json({ success: false, error: 'Unauthorized', code: 'DASHBOARD_AUTH_REQUIRED' })
  })
}
