import type { Request } from 'express'

/**
 * Optional canonical site URL. When unset, OAuth redirect is inferred from the incoming HTTP request
 * (same behavior as opening n8n on `http://host:port`).
 */
export function envPiePublicUrl(): string {
  return String(process.env.PIE_PUBLIC_URL || process.env.ARTHA_PUBLIC_URL || '').trim().replace(/\/+$/, '')
}

/** Derive `https://host:port` from reverse-proxy headers or the socket (local dev). */
export function inferPublicBaseUrlFromRequest(req: Request): string | null {
  const xfProto = req.headers['x-forwarded-proto']
  const proto =
    (Array.isArray(xfProto) ? xfProto[0] : xfProto)?.split(',')[0]?.trim() ||
    ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http')
  const xfHost = req.headers['x-forwarded-host']
  const rawHost = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || req.headers['host']
  const h = String(rawHost || '')
    .split(',')[0]
    ?.trim()
    .replace(/\/+$/, '')
  if (!h || h.length > 253) return null
  if (/[\s<>"'`]/.test(h)) return null
  return `${proto}://${h}`
}

export function resolveGoogleMailPublicBaseUrl(req?: Request): string | null {
  const fromEnv = envPiePublicUrl()
  if (fromEnv) return fromEnv
  if (req) return inferPublicBaseUrlFromRequest(req)
  return null
}

export function getGoogleMailOAuthRedirectUriForRequest(req?: Request): string | null {
  const base = resolveGoogleMailPublicBaseUrl(req)
  if (!base) return null
  return `${base.replace(/\/+$/, '')}/api/oauth/google/mail/callback`
}

export function envGoogleMailOAuthClientId(): string {
  return String(
    process.env.PIE_GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  ).trim()
}

export function envGoogleMailOAuthClientSecret(): string {
  return String(
    process.env.PIE_GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
  ).trim()
}

/** Redirect URI when only `PIE_PUBLIC_URL` is set (no HTTP request). */
export function getGoogleMailOAuthRedirectUriFromEnv(): string | null {
  return getGoogleMailOAuthRedirectUriForRequest(undefined)
}

/** @deprecated Prefer {@link getGoogleMailOAuthRedirectUriForRequest} — kept for callers without `Request`. */
export function getGoogleMailOAuthRedirectUri(): string | null {
  return getGoogleMailOAuthRedirectUriFromEnv()
}

/** True only when client id+secret and public base are all provided via env (no DB, no request). */
export function isGoogleMailOAuthEnvComplete(): boolean {
  return !!(envPiePublicUrl() && envGoogleMailOAuthClientId() && envGoogleMailOAuthClientSecret())
}
