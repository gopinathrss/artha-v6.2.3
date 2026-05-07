import type { Express, Request } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { realPrisma } from '../lib/prisma'
import { ensureAppSettings } from '../lib/appSettingsMerge'
import {
  buildSetCookieHeader,
  createDashboardSessionCookieValue,
  isDashboardAuthEnabled,
  parseDashboardSessionCookie,
  sha256Hex
} from '../lib/dashboardAuth'
import { sendEmail } from '../lib/emailService'
import { resolveGoogleMailPublicBaseUrl } from '../lib/integrations/googleMailOAuthEnv'

const SALT_ROUNDS = 11
const loginHits: Record<string, { n: number; start: number }> = {}
const forgotHits: Record<string, { n: number; start: number }> = {}

function clientIp(req: Request): string {
  const h = req.headers['x-forwarded-for']
  const raw = Array.isArray(h) ? h[0] : h?.split(',')[0]?.trim()
  return String(raw || req.socket.remoteAddress || 'local')
}

function rateLogin(ip: string): boolean {
  const w = loginHits[ip] || { n: 0, start: Date.now() }
  if (Date.now() - w.start > 300_000) {
    w.n = 0
    w.start = Date.now()
  }
  w.n += 1
  loginHits[ip] = w
  return w.n <= 12
}

function rateForgot(ip: string): boolean {
  const w = forgotHits[ip] || { n: 0, start: Date.now() }
  if (Date.now() - w.start > 3_600_000) {
    w.n = 0
    w.start = Date.now()
  }
  w.n += 1
  forgotHits[ip] = w
  return w.n <= 5
}

export function registerDashboardAuthRoutes(app: Express): void {
  app.get('/api/auth/me', async (req, res) => {
    try {
      if (!isDashboardAuthEnabled()) {
        return res.json({
          success: true,
          data: { authDisabled: true, authenticated: true, needsBootstrap: false }
        })
      }
      await ensureAppSettings(realPrisma)
      const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } }).catch(() => null)
      const hasPassword = !!(row as { dashboardPasswordHash?: string | null } | null)?.dashboardPasswordHash
      const cookieOk = parseDashboardSessionCookie(req.headers.cookie)
      res.json({
        success: true,
        data: {
          authDisabled: false,
          authenticated: cookieOk,
          needsBootstrap: !hasPassword
        }
      })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      if (!isDashboardAuthEnabled()) return res.status(400).json({ success: false, error: 'Auth not enabled' })
      await ensureAppSettings(realPrisma)
      const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } })
      if (!row) return res.status(500).json({ success: false, error: 'AppSettings missing' })
      if ((row as { dashboardPasswordHash?: string | null }).dashboardPasswordHash) {
        return res.status(400).json({ success: false, error: 'Password already set — use login' })
      }
      const key = String((req.body || {}).bootstrapKey || '').trim()
      const envExpected = String(process.env.PIE_AUTH_BOOTSTRAP_KEY || '').trim()
      const storedHash = (row as { dashboardBootstrapKeyHash?: string | null }).dashboardBootstrapKeyHash
      let bootstrapOk = false
      if (envExpected && key === envExpected) bootstrapOk = true
      if (!bootstrapOk && storedHash) {
        bootstrapOk = await bcrypt.compare(key, storedHash)
      }
      if (!bootstrapOk) {
        return res.status(403).json({
          success: false,
          error:
            'Invalid bootstrap key. Set a phrase under Settings → App preferences (saved hashed), or set PIE_AUTH_BOOTSTRAP_KEY in .env, then restart the server.'
        })
      }
      const pwd = String((req.body || {}).password || '')
      if (pwd.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
      const hash = await bcrypt.hash(pwd, SALT_ROUNDS)
      await realPrisma.appSettings.update({
        where: { id: 'default' },
        data: { dashboardPasswordHash: hash } as never
      })
      const c = createDashboardSessionCookieValue()
      res.setHeader('Set-Cookie', buildSetCookieHeader(c, req))
      res.json({ success: true, data: { ok: true } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/auth/login', async (req, res) => {
    try {
      if (!isDashboardAuthEnabled()) return res.status(400).json({ success: false, error: 'Auth not enabled' })
      if (!rateLogin(clientIp(req))) {
        return res.status(429).json({ success: false, error: 'Too many attempts — wait 5 minutes' })
      }
      await ensureAppSettings(realPrisma)
      const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } })
      const hash = (row as { dashboardPasswordHash?: string | null } | null)?.dashboardPasswordHash
      if (!hash) return res.status(400).json({ success: false, error: 'No password set yet — use the first-time setup form' })
      const pwd = String((req.body || {}).password || '')
      const ok = await bcrypt.compare(pwd, hash)
      if (!ok) return res.status(401).json({ success: false, error: 'Invalid password' })
      const c = createDashboardSessionCookieValue()
      res.setHeader('Set-Cookie', buildSetCookieHeader(c, req))
      res.json({ success: true, data: { ok: true } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', buildSetCookieHeader('', req, true))
    res.json({ success: true, data: { ok: true } })
  })

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      if (!isDashboardAuthEnabled()) return res.status(400).json({ success: false, error: 'Auth not enabled' })
      if (!rateForgot(clientIp(req))) {
        return res.status(429).json({ success: false, error: 'Too many reset requests — try again later' })
      }
      const email = String((req.body || {}).email || '').trim().toLowerCase()
      const settings = await realPrisma.settings.findFirst({ orderBy: { createdAt: 'asc' } })
      const alert = String(settings?.alertEmail || '').trim().toLowerCase()
      if (!alert || email !== alert) {
        return res.json({
          success: true,
          data: { ok: true, message: 'If this email matches your alert address, a reset link was sent.' }
        })
      }
      const token = crypto.randomBytes(32).toString('hex')
      const sha = sha256Hex(token)
      const exp = new Date(Date.now() + 3600_000)
      await ensureAppSettings(realPrisma)
      await realPrisma.appSettings.update({
        where: { id: 'default' },
        data: {
          dashboardPasswordResetTokenSha256: sha,
          dashboardPasswordResetExpires: exp
        } as never
      })
      const base = resolveGoogleMailPublicBaseUrl(req)
      if (!base) {
        return res.status(503).json({
          success: false,
          error:
            'Cannot build reset link: set PIE_PUBLIC_URL or open this site from the URL you use in production, and configure email (SMTP / Gmail OAuth).'
        })
      }
      const link = `${base.replace(/\/+$/, '')}/reset-password.html#${encodeURIComponent(token)}`
      const html = `<p>You asked to reset your PIE dashboard password.</p><p><a href="${link}">Set a new password</a></p><p style="word-break:break-all;font-size:14px">${link}</p><p>This link expires in one hour.</p>`
      const out = await sendEmail(alert, 'PIE — password reset', html)
      if (!out.sent) {
        await realPrisma.appSettings.update({
          where: { id: 'default' },
          data: { dashboardPasswordResetTokenSha256: null, dashboardPasswordResetExpires: null } as never
        })
        return res.status(503).json({ success: false, error: out.error || 'Could not send email' })
      }
      res.json({ success: true, data: { ok: true, message: 'Check your alert email inbox.' } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      if (!isDashboardAuthEnabled()) return res.status(400).json({ success: false, error: 'Auth not enabled' })
      const token = String((req.body || {}).token || '').trim()
      const pwd = String((req.body || {}).password || '')
      if (!token || pwd.length < 8) {
        return res.status(400).json({ success: false, error: 'Token and password (8+ chars) required' })
      }
      await ensureAppSettings(realPrisma)
      const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } })
      const r = row as {
        dashboardPasswordResetTokenSha256?: string | null
        dashboardPasswordResetExpires?: Date | null
      } | null
      if (!r?.dashboardPasswordResetTokenSha256 || !r.dashboardPasswordResetExpires) {
        return res.status(400).json({ success: false, error: 'No active reset — request a new link' })
      }
      if (new Date() > new Date(r.dashboardPasswordResetExpires)) {
        return res.status(400).json({ success: false, error: 'Reset link expired' })
      }
      if (sha256Hex(token) !== r.dashboardPasswordResetTokenSha256) {
        return res.status(400).json({ success: false, error: 'Invalid token' })
      }
      const hash = await bcrypt.hash(pwd, SALT_ROUNDS)
      await realPrisma.appSettings.update({
        where: { id: 'default' },
        data: {
          dashboardPasswordHash: hash,
          dashboardPasswordResetTokenSha256: null,
          dashboardPasswordResetExpires: null
        } as never
      })
      const c = createDashboardSessionCookieValue()
      res.setHeader('Set-Cookie', buildSetCookieHeader(c, req))
      res.json({ success: true, data: { ok: true } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
