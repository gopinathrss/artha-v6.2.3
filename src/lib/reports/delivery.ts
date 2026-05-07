import crypto from 'crypto'
import { getPrisma } from '../prisma'
import { realPrisma } from '../prismaProvider'
import { sendEmail } from '../emailService'
import { getSecret } from '../secrets'

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

const publicBase = () =>
  (process.env.PIE_PUBLIC_URL || process.env.ARTHA_PUBLIC_URL || process.env.PUBLIC_URL || 'http://localhost:3002').replace(
    /\/$/,
    ''
  )

export async function deliverReport(
  result: { html: string; metadata: Record<string, unknown> },
  opts: { type: string }
): Promise<{ reportId: string; viewUrl: string }> {
  const prisma = await getPrisma()
  const settings = await realPrisma.settings.findFirst()
  const meta = result.metadata as { title?: string; period?: { start: string; end: string } }
  const periodLabel =
    meta.period?.start && meta.period?.end
      ? `${meta.period.start.slice(0, 10)} → ${meta.period.end.slice(0, 10)}`
      : new Date().toISOString().slice(0, 10)
  const token = generateToken()
  const report = await prisma.generatedReport.create({
    data: {
      type: opts.type,
      periodLabel,
      monthYear: null,
      dataSnapshot: { ...result.metadata, delivered: true } as object,
      token,
      audience: 'INTERNAL',
      title: meta.title ?? opts.type,
      htmlContent: result.html
    }
  })
  const viewUrl = `${publicBase()}/reports/view/${report.id}?token=${encodeURIComponent(token)}`

  if (settings?.alertEmail && settings?.smtpHost && settings?.smtpUser) {
    const sub = `PIE — ${meta.title ?? opts.type} report`
    const body = `<p>Your scheduled report is ready.</p><p><a href="${viewUrl}">Open report</a></p>`
    await sendEmail(settings.alertEmail, sub, body)
  }

  let tgTok: string | null = null
  try {
    tgTok = settings ? await getSecret('telegramBotToken') : null
  } catch {
    tgTok = null
  }
  if (settings?.telegramChatId && tgTok) {
    try {
      const { getTelegramBot } = await import('../telegram/bot')
      const bot = getTelegramBot()
      if (bot) {
        await bot.sendMessage(settings.telegramChatId, `PIE report (${opts.type}): ${viewUrl}`)
      }
    } catch {
      /* optional */
    }
  }

  return { reportId: report.id, viewUrl }
}
