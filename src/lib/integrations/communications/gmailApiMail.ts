import { randomBytes } from 'crypto'
import type { GoogleMailOAuthClientCreds } from '../googleMailOAuthCredentials'

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'

export const GMAIL_OAUTH_SCOPES = [GMAIL_SEND_SCOPE, USERINFO_EMAIL_SCOPE] as const

export function buildGoogleMailAuthorizationUrl(
  state: string,
  creds: GoogleMailOAuthClientCreds,
  redirectUri: string
): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', creds.clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', [...GMAIL_OAUTH_SCOPES].join(' '))
  u.searchParams.set('state', state)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  return u.toString()
}

type TokenJson = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export async function exchangeGoogleMailAuthCode(
  code: string,
  creds: GoogleMailOAuthClientCreds,
  redirectUri: string
): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const j = (await r.json()) as TokenJson
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Token exchange failed (${r.status})`)
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_in: Number(j.expires_in) || 3600
  }
}

export async function getGoogleMailAccessToken(
  refreshToken: string,
  creds: GoogleMailOAuthClientCreds
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token'
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const j = (await r.json()) as TokenJson
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Refresh token failed (${r.status})`)
  }
  return j.access_token
}

function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function encodeWordUtf8(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

/** RFC 2822 / Gmail `users.messages.send` raw field (base64url-encoded by caller). */
export function buildRawMimeForGmailApi(params: {
  fromAddr: string
  fromDisplayName: string
  to: string
  subject: string
  htmlBody: string
  textBody: string
}): string {
  const boundary = 'pie_alt_' + randomBytes(12).toString('hex')
  const subj = encodeWordUtf8(params.subject)
  const fromName = encodeWordUtf8(params.fromDisplayName)
  const lines = [
    `From: ${fromName} <${params.fromAddr}>`,
    `To: ${params.to}`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.textBody, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.htmlBody, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
    ''
  ]
  return lines.join('\r\n')
}

export async function sendMailViaGmailApi(params: {
  refreshToken: string
  rawMime: string
  clientCreds: GoogleMailOAuthClientCreds
}): Promise<void> {
  const accessToken = await getGoogleMailAccessToken(params.refreshToken, params.clientCreds)
  const raw = base64Url(Buffer.from(params.rawMime, 'utf8'))
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Gmail API send failed (${res.status}): ${t.slice(0, 400)}`)
  }
}

/** Proves refresh token + client credentials work (HTTPS only, no SMTP). */
export async function verifyGmailOAuthRefreshToken(
  refreshToken: string,
  clientCreds: GoogleMailOAuthClientCreds
): Promise<void> {
  const accessToken = await getGoogleMailAccessToken(refreshToken, clientCreds)
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`userinfo failed (${r.status}): ${t.slice(0, 200)}`)
  }
}
