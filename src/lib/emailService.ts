import { realPrisma } from './prisma'
import { getSecret } from './secrets'
import { getProviderDecrypted } from './integrations/store'
import {
  buildRawMimeForGmailApi,
  sendMailViaGmailApi
} from './integrations/communications/gmailApiMail'
import { resolveGoogleMailOAuthClientSecrets } from './integrations/googleMailOAuthCredentials'
import {
  createSmtpTransport,
  isGmailSubmissionHost,
  normalizeSmtpHost,
  sendMailWithGmailFallbackChain
} from './integrations/communications/smtp'

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    const integ = await getProviderDecrypted(realPrisma, 'comms.smtp')
    if (integ?.config?.user) {
      const user = String(integ.config.user)
      const fromAddr = String(integ.config.fromAddress || user)
      const displayName = 'PIE — Personal Investment Engine'
      const textBody = htmlContent.replace(/<[^>]*>/g, '')
      const refreshToken = integ.secrets?.refreshToken
      if (refreshToken) {
        const clientCreds = await resolveGoogleMailOAuthClientSecrets(realPrisma)
        if (!clientCreds) {
          return {
            sent: false,
            error:
              'Gmail OAuth refresh token is saved but OAuth client credentials are missing. Save Client ID and Client Secret on the SMTP integration (or set PIE_GOOGLE_OAUTH_* env vars).'
          }
        }
        const raw = buildRawMimeForGmailApi({
          fromAddr,
          fromDisplayName: displayName,
          to,
          subject,
          htmlBody: htmlContent,
          textBody
        })
        await sendMailViaGmailApi({ refreshToken, rawMime: raw, clientCreds })
        return { sent: true }
      }
      const pass = integ.secrets?.password
      if (pass) {
        const host = String(integ.config.host || 'smtp.gmail.com')
        const rejectUnauthorized = integ.config.rejectUnauthorized !== false
        const payload = {
          from: `"${displayName}" <${fromAddr}>`,
          to,
          subject,
          html: htmlContent,
          text: textBody
        }
        if (isGmailSubmissionHost(host)) {
          await sendMailWithGmailFallbackChain({ user, password: pass, rejectUnauthorized }, payload)
          return { sent: true }
        }
        const port = Number(integ.config.port || 587)
        const transporter = createSmtpTransport({ host, port, user, password: pass, rejectUnauthorized })
        await transporter.sendMail(payload)
        return { sent: true }
      }
    }

    const settings = await realPrisma.settings.findFirst()
    const smtpPass = settings ? await getSecret('smtpPass') : null
    if (!settings?.smtpUser || !smtpPass) {
      return {
        sent: false,
        error:
          'SMTP not configured. Add comms.smtp (Sign in with Google for Gmail, or host/user/app password) or legacy Settings.'
      }
    }
    const legHost = normalizeSmtpHost(settings.smtpHost || 'smtp.gmail.com')
    const legPayload = {
      from: `"PIE — Personal Investment Engine" <${settings.smtpUser}>`,
      to,
      subject,
      html: htmlContent,
      text: htmlContent.replace(/<[^>]*>/g, '')
    }
    // V6: TLS verification on by default; opt out via PIE_SMTP_INSECURE_TLS=1
    // (e.g. for self-signed test relays). Production should never set this.
    const insecureTls = String(process.env.PIE_SMTP_INSECURE_TLS || '').trim() === '1'
    const reject = !insecureTls
    if (isGmailSubmissionHost(legHost)) {
      await sendMailWithGmailFallbackChain(
        { user: settings.smtpUser, password: smtpPass, rejectUnauthorized: reject },
        legPayload
      )
      return { sent: true }
    }
    const transporter = createSmtpTransport({
      host: legHost,
      port: settings.smtpPort || 587,
      user: settings.smtpUser,
      password: smtpPass,
      rejectUnauthorized: reject
    })
    await transporter.sendMail(legPayload)
    return { sent: true }
  } catch (err: unknown) {
    let msg = err instanceof Error ? err.message : String(err)
    if (/greeting never received|timeout|econnreset|ECONNRESET/i.test(msg)) {
      msg +=
        ' — For Gmail: use a Google app password and Strict TLS on. PIE tries 587 over IPv4, 587 on the hostname, then 465. If all fail, the network is likely blocking SMTP — try another Wi‑Fi/mobile hotspot/VPN or a relay (SendGrid, SES, …).'
    }
    console.error('[Email] Send failed:', msg)
    return { sent: false, error: msg }
  }
}

export async function sendTestEmail(): Promise<{ sent: boolean; error?: string }> {
  const settings = await realPrisma.settings.findFirst()
  if (!settings?.alertEmail) return { sent: false, error: 'No alert email configured' }
  return sendEmail(
    settings.alertEmail,
    'PIE — Email delivery test',
    '<h2 style="font-family:Georgia">PIE is connected ✓</h2><p>Your email delivery is working correctly.</p>'
  )
}
