import crypto from 'crypto'

const TTL_MS = 15 * 60_000

export type MailOAuthStatePayload = { exp: number; returnTo: string }

function stateSecret(): string {
  return String(process.env.SESSION_SECRET || process.env.PIE_OAUTH_STATE_SECRET || 'pie-oauth-dev-only')
    .trim() || 'pie-oauth-dev-only'
}

export function sanitizeOAuthReturnTo(r: string | undefined): string {
  const def = '/settings'
  if (!r || typeof r !== 'string') return def
  const t = r.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return def
  if (/[\r\n\0]/.test(t)) return def
  return t.slice(0, 256) || def
}

export function buildMailOAuthRedirectAfterConnect(publicUrl: string, returnTo: string, ok: boolean, err?: string) {
  const base = publicUrl.replace(/\/+$/, '') + sanitizeOAuthReturnTo(returnTo)
  const q = ok ? 'gmail_oauth=ok' : `gmail_oauth=err&reason=${encodeURIComponent(err || 'unknown')}`
  return base.includes('?') ? `${base}&${q}` : `${base}?${q}`
}

export function signMailOAuthState(payload: MailOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyMailOAuthState(state: string): MailOAuthStatePayload | null {
  const i = state.lastIndexOf('.')
  if (i <= 0) return null
  const body = state.slice(0, i)
  const sig = state.slice(i + 1)
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  try {
    if (!crypto.timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  let parsed: MailOAuthStatePayload
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MailOAuthStatePayload
  } catch {
    return null
  }
  if (typeof parsed.exp !== 'number' || typeof parsed.returnTo !== 'string') return null
  if (Date.now() > parsed.exp) return null
  return { exp: parsed.exp, returnTo: sanitizeOAuthReturnTo(parsed.returnTo) }
}

export function newMailOAuthStatePayload(returnTo: string): MailOAuthStatePayload {
  return { exp: Date.now() + TTL_MS, returnTo: sanitizeOAuthReturnTo(returnTo) }
}
