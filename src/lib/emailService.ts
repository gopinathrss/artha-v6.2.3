import nodemailer from 'nodemailer'
import { prisma } from './prisma'

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    const settings = await prisma.settings.findFirst()
    if (!settings?.smtpUser || !settings.smtpPass) {
      return { sent: false, error: 'SMTP not configured. Go to Settings → Integrations.' }
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost || 'smtp.gmail.com',
      port: settings.smtpPort || 587,
      secure: false,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false }
    })

    await transporter.sendMail({
      from: `"ARTHA Wealth Intelligence" <${settings.smtpUser}>`,
      to,
      subject,
      html: htmlContent,
      text: htmlContent.replace(/<[^>]*>/g, '')
    })

    return { sent: true }
  } catch (err: any) {
    console.error('[Email] Send failed:', err.message)
    return { sent: false, error: err.message }
  }
}

export async function sendTestEmail(): Promise<{ sent: boolean; error?: string }> {
  const settings = await prisma.settings.findFirst()
  if (!settings?.alertEmail) return { sent: false, error: 'No alert email configured' }
  return sendEmail(
    settings.alertEmail,
    'ARTHA — Email delivery test',
    '<h2 style="font-family:Georgia">ARTHA is connected ✓</h2><p>Your email delivery is working correctly.</p>'
  )
}
