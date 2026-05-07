import crypto from 'crypto'
import type { Request } from 'express'
import type { PrismaClient } from '@prisma/client'
import { ensureAppSettings } from './appSettingsMerge'

export const DASHBOARD_SESSION_COOKIE = 'pie_dashboard'
const SESSION_DAYS = 7

/** Loaded from AppSettings.dashboardAuthEnabled; refreshed at boot and after Settings save. */
let cachedDashboardAuthEnabled = false

/**
 * Dashboard login is on when AppSettings says so.
 * Set `PIE_DASHBOARD_AUTH=0` (or false/off/no) to force login **off** regardless of DB (lockout recovery).
 */
export function isDashboardAuthEnabled(): boolean {
  const forceOff = String(process.env.PIE_DASHBOARD_AUTH || '').trim()
  if (/^(0|false|no|off)$/i.test(forceOff)) return false
  return cachedDashboardAuthEnabled
}

/** Re-read flag from DB (personal AppSettings). */
export async function refreshDashboardAuthEnabledFromDb(prisma: PrismaClient): Promise<void> {
  try {
    await ensureAppSettings(prisma)
    const row = await prisma.appSettings.findUnique({ where: { id: 'default' } })
    cachedDashboardAuthEnabled = !!((row as { dashboardAuthEnabled?: boolean } | null)?.dashboardAuthEnabled ?? false)
  } catch {
    cachedDashboardAuthEnabled = false
  }
}

function sessionSecret(): string {
  return String(process.env.SESSION_SECRET || process.env.PIE_OAUTH_STATE_SECRET || '')
    .trim()
    .slice(0, 64)
}

function signPayload(payloadB64url: string): string {
  const key = sessionSecret() || 'pie-dev-insecure-change-session-secret'
  return crypto.createHmac('sha256', key).update(payloadB64url).digest('base64url')
}

export function createDashboardSessionCookieValue(): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000
  const body = Buffer.from(JSON.stringify({ v: 1, exp }), 'utf8').toString('base64url')
  const sig = signPayload(body)
  return `${body}.${sig}`
}

export function parseDashboardSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false
  const parts = cookieHeader.split(';').map((s) => s.trim())
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq < 0) continue
    if (p.slice(0, eq).trim() !== DASHBOARD_SESSION_COOKIE) continue
    const val = p.slice(eq + 1)
    const i = val.lastIndexOf('.')
    if (i <= 0) return false
    const body = val.slice(0, i)
    const sig = val.slice(i + 1)
    const expected = signPayload(body)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    try {
      if (!crypto.timingSafeEqual(a, b)) return false
    } catch {
      return false
    }
    try {
      const j = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { v?: number; exp?: number }
      if (j.v !== 1 || typeof j.exp !== 'number') return false
      if (Date.now() > j.exp) return false
      return true
    } catch {
      return false
    }
  }
  return false
}

export function buildSetCookieHeader(value: string, _req: Request, clear = false): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  if (clear) {
    return `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  }
  return `${DASHBOARD_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
}

export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

/** Strip sensitive auth columns before sending AppSettings to the client. */
export function omitDashboardAuthSecrets<T extends Record<string, unknown>>(row: T | null): T | null {
  if (!row || typeof row !== 'object') return row
  const o = { ...row } as Record<string, unknown>
  delete o.dashboardPasswordHash
  delete o.dashboardBootstrapKeyHash
  delete o.dashboardPasswordResetTokenSha256
  delete o.dashboardPasswordResetExpires
  return o as T
}
