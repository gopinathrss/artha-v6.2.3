import type { Express, Request } from 'express'
import { realPrisma } from '../lib/prisma'
import {
  buildGoogleMailAuthorizationUrl,
  exchangeGoogleMailAuthCode,
  GMAIL_OAUTH_SCOPES
} from '../lib/integrations/communications/gmailApiMail'
import { resolveGoogleMailOAuthClientSecrets } from '../lib/integrations/googleMailOAuthCredentials'
import { resolveGoogleMailPublicBaseUrl, getGoogleMailOAuthRedirectUriForRequest } from '../lib/integrations/googleMailOAuthEnv'
import {
  buildMailOAuthRedirectAfterConnect,
  newMailOAuthStatePayload,
  sanitizeOAuthReturnTo,
  signMailOAuthState,
  verifyMailOAuthState
} from '../lib/integrations/googleMailOAuthState'
import { upsertIntegrationProvider } from '../lib/integrations/store'

const startHits: Record<string, { n: number; start: number }> = {}
const START_MAX = 20
const START_WINDOW_MS = 900_000

function rateLimitOAuthStart(req: Request): boolean {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local')
  const id = ip.split(',')[0]?.trim() || ip
  const now = Date.now()
  const w = startHits[id] || { n: 0, start: now }
  if (now - w.start > START_WINDOW_MS) {
    w.n = 0
    w.start = now
  }
  w.n += 1
  startHits[id] = w
  return w.n <= START_MAX
}

async function loadOAuthContext(req: Request) {
  const creds = await resolveGoogleMailOAuthClientSecrets(realPrisma)
  const redirectUri = getGoogleMailOAuthRedirectUriForRequest(req)
  const pub = resolveGoogleMailPublicBaseUrl(req)
  return { creds, redirectUri, pub }
}

export function registerGoogleMailOAuthRoutes(app: Express): void {
  app.get('/api/oauth/google/mail/meta', async (req, res) => {
    try {
      const { creds, redirectUri, pub } = await loadOAuthContext(req)
      const missing: string[] = []
      if (!redirectUri) {
        missing.push('Public URL (set PIE_PUBLIC_URL or open Settings from the same host/port Google will redirect to)')
      }
      if (!creds?.clientId) missing.push('OAuth Client ID (save below or set PIE_GOOGLE_OAUTH_CLIENT_ID)')
      if (!creds?.clientSecret) missing.push('OAuth Client Secret (save below or set PIE_GOOGLE_OAUTH_CLIENT_SECRET)')
      void GMAIL_OAUTH_SCOPES
      res.json({
        success: true,
        data: {
          configured: missing.length === 0,
          redirectUri,
          publicUrl: pub || null,
          missing
        }
      })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/oauth/google/mail/start', async (req, res) => {
    try {
      const { creds, redirectUri } = await loadOAuthContext(req)
      if (!creds || !redirectUri) {
        res.status(503).json({
          success: false,
          error:
            'Gmail OAuth not ready. Save OAuth Client ID and Client Secret on the SMTP card (or set env vars), and ensure the redirect URL below is registered in Google Cloud.'
        })
        return
      }
      if (!rateLimitOAuthStart(req)) {
        res.status(429).json({ success: false, error: 'Too many OAuth starts — try again in a few minutes.' })
        return
      }
      const returnTo = sanitizeOAuthReturnTo(typeof req.query.r === 'string' ? req.query.r : undefined)
      const state = signMailOAuthState(newMailOAuthStatePayload(returnTo))
      const url = buildGoogleMailAuthorizationUrl(state, creds, redirectUri)
      res.redirect(302, url)
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/oauth/google/mail/callback', async (req, res) => {
    const { creds, redirectUri, pub } = await loadOAuthContext(req)
    const failRedirect = (msg: string, returnTo?: string) => {
      if (!pub) {
        res.status(500).type('text/plain').send(`OAuth error: ${msg}`)
        return
      }
      const r = returnTo || '/settings'
      res.redirect(302, buildMailOAuthRedirectAfterConnect(pub, r, false, msg))
    }
    try {
      const err = typeof req.query.error === 'string' ? req.query.error : ''
      if (err) {
        failRedirect(String(req.query.error_description || err))
        return
      }
      const code = typeof req.query.code === 'string' ? req.query.code : ''
      const stateRaw = typeof req.query.state === 'string' ? req.query.state : ''
      if (!code || !stateRaw) {
        failRedirect('Missing code or state')
        return
      }
      const st = verifyMailOAuthState(stateRaw)
      if (!st) {
        failRedirect('Invalid or expired state — start Sign in again from Settings')
        return
      }
      if (!creds || !redirectUri || !pub) {
        failRedirect('Server OAuth not configured (client id/secret or public URL)', st.returnTo)
        return
      }
      const tokens = await exchangeGoogleMailAuthCode(code, creds, redirectUri)
      if (!tokens.refresh_token) {
        failRedirect(
          'No refresh token from Google. Revoke PIE access in Google Account → Security → Third-party access, then try Sign in again.',
          st.returnTo
        )
        return
      }
      const access = tokens.access_token
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access}` }
      })
      if (!ui.ok) {
        failRedirect(`userinfo HTTP ${ui.status}`, st.returnTo)
        return
      }
      const profile = (await ui.json()) as { email?: string }
      const email = String(profile.email || '').trim().toLowerCase()
      if (!email || !email.includes('@')) {
        failRedirect('Could not read Google account email', st.returnTo)
        return
      }

      await upsertIntegrationProvider(realPrisma, 'comms.smtp', {
        enabled: true,
        config: {
          authMode: 'oauth2',
          host: 'smtp.gmail.com',
          port: 587,
          user: email,
          fromAddress: email,
          rejectUnauthorized: true
        },
        secrets: { refreshToken: tokens.refresh_token }
      })

      res.redirect(302, buildMailOAuthRedirectAfterConnect(pub, st.returnTo, true))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const st = typeof req.query.state === 'string' ? verifyMailOAuthState(req.query.state) : null
      failRedirect(msg, st?.returnTo)
    }
  })
}
