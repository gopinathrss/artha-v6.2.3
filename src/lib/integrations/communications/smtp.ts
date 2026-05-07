import dns from 'dns'
import { lookup } from 'node:dns/promises'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

/** Prefer IPv4 for SMTP — some Windows/resolver setups get flaky IPv6 routes to Google (ECONNRESET). */
try {
  if (typeof (dns as unknown as { setDefaultResultOrder?: (o: string) => void }).setDefaultResultOrder === 'function') {
    ;(dns as unknown as { setDefaultResultOrder: (o: string) => void }).setDefaultResultOrder('ipv4first')
  }
} catch {
  /* */
}

const SMTP_TIMEOUT_MS = 60_000

/** Many users paste `imap.gmail.com` into SMTP — normalize to the submission host. */
export function normalizeSmtpHost(host: string): string {
  const h = String(host || '').trim()
  if (/^imap\./i.test(h)) return h.replace(/^imap\./i, 'smtp.')
  return h
}

export function isGmailSubmissionHost(host: string): boolean {
  return /^smtp\.gmail\.com$/i.test(normalizeSmtpHost(host))
}

export type GmailSmtpAttempt = { transport: Transporter; label: string }

/**
 * Gmail: try **587 to resolved IPv4** (TLS SNI still `smtp.gmail.com`), then **587 hostname**,
 * then **465** (`service: 'Gmail'`). Fixes some networks where hostname resolves to a bad path
 * but literal IPv4 works, or IPv6 is broken.
 */
export async function createGmailSmtpTransportAttempts(opts: {
  user: string
  password: string
  rejectUnauthorized: boolean
}): Promise<GmailSmtpAttempt[]> {
  const auth = { user: opts.user, pass: opts.password }
  const ru = opts.rejectUnauthorized !== false
  const tls587: { rejectUnauthorized: boolean; minVersion: 'TLSv1.2'; servername: string } = {
    rejectUnauthorized: ru,
    minVersion: 'TLSv1.2',
    servername: 'smtp.gmail.com'
  }
  const attempts: GmailSmtpAttempt[] = []

  try {
    const { address } = await lookup('smtp.gmail.com', { family: 4 })
    attempts.push({
      label: `587 STARTTLS (IPv4 ${address})`,
      transport: nodemailer.createTransport({
        host: address,
        port: 587,
        secure: false,
        auth,
        tls: tls587,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS
      })
    })
  } catch {
    /* no A record / offline — skip literal hop */
  }

  attempts.push({
    label: '587 STARTTLS (smtp.gmail.com)',
    transport: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth,
      tls: tls587,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS
    })
  })

  attempts.push({
    label: '465 SSL (service Gmail)',
    transport: nodemailer.createTransport({
      service: 'Gmail',
      auth,
      tls: { rejectUnauthorized: ru, servername: 'smtp.gmail.com' },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS
    })
  })

  return attempts
}

function errLine(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Tries each Gmail transport; throws one error listing every hop (for debugging). */
export async function sendMailWithGmailFallbackChain(
  opts: { user: string; password: string; rejectUnauthorized: boolean },
  mail: { from: string; to: string; subject: string; html: string; text: string }
): Promise<void> {
  const attempts = await createGmailSmtpTransportAttempts(opts)
  const parts: string[] = []
  for (const { transport, label } of attempts) {
    try {
      await transport.sendMail(mail)
      return
    } catch (e) {
      parts.push(`${label}: ${errLine(e)}`)
    }
  }
  throw new Error(parts.join(' · '))
}

/**
 * Non-Gmail SMTP: **587** = STARTTLS (`secure: false`). **465** = implicit TLS (`secure: true`).
 */
export function createSmtpTransport(opts: {
  host: string
  port: number
  user: string
  password: string
  rejectUnauthorized?: boolean
}): Transporter {
  const host = normalizeSmtpHost(opts.host)
  const port = Number(opts.port) || 587
  const secure = port === 465
  const rejectUnauthorized = opts.rejectUnauthorized !== false

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: opts.user, pass: opts.password },
    tls: { rejectUnauthorized },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS
  })
}
