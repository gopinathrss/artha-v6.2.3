import TelegramBot from 'node-telegram-bot-api'
import { prisma } from '../prisma'
import { getPortfolioSummary } from '../portfolio'
import { computeAdherenceStats } from '../adherence'
import { getPlanForMonth, currentMonthYear } from '../allocationPlanner'
import { markPlanRowDone } from '../planRowUpdate'
import { ensureRowType } from '../allocationRowTypes'
import { askArtha } from '../aiIntelligence'

let botInstance: TelegramBot | null = null

function formatCzk(n: number) {
  return (Math.round(n) || 0).toLocaleString('cs-CZ')
}

export function getTelegramBot(): TelegramBot | null {
  return botInstance
}

export function stopTelegramBot() {
  if (botInstance) {
    try {
      botInstance.stopPolling()
    } catch {
      // ignore
    }
    botInstance = null
  }
}

export async function buildDailyDigest(): Promise<string> {
  const settings = await prisma.settings.findFirst()
  const s = await getPortfolioSummary()
  if (!s.success || !s.data) {
    return `*ARTHA — Daily digest*\n\nPortfolio unavailable. Check database / profile.`
  }
  const d = s.data
  const nw = d.netWorth?.totalCzk ?? 0
  const mom = d.momChange || { czk: 0, pct: 0 }
  const adh = await computeAdherenceStats(6).catch(() => ({ adherencePct: 0 }))
  const my = currentMonthYear()
  const plan = await getPlanForMonth(my)
  const rows = (plan?.allocations as Array<{ destination?: string; executionStatus?: string; amountCzk?: number }>) || []
  const pending = rows
    .map((r, i) => ({ i, r }))
    .filter((x) => (String(x.r.executionStatus || 'PENDING').toUpperCase() === 'PENDING'))
  const top = pending[0]
  const action = top
    ? `Top action: *${(top.r.destination || 'row').replace(/\*/g, '')}* — ${formatCzk(
        Number(top.r.amountCzk) || 0
      )} Kč (PENDING)`
    : 'No pending lines in the current plan (or no plan).'
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yAlerts = await prisma.alertLog
    .findMany({ where: { firedAt: { gte: y } }, orderBy: { firedAt: 'desc' }, take: 3 })
    .catch(() => [])
  const al =
    yAlerts.length === 0
      ? 'No alerts fired yesterday (or log empty).'
      : (yAlerts as { urgency?: string; title?: string }[])
          .map((a) => `${a.urgency || 'INFO'}: ${(a.title || '').replace(/\*/g, '')}`)
          .join('\n')
  const fds = await prisma.indiaFixedDeposit.findMany({ where: { maturityDate: { gte: new Date() } } }).catch(() => [])
  const soon = (fds as { bank: string; maturityDate: Date }[])
    .map((f) => {
      const days = Math.ceil((new Date(f.maturityDate).getTime() - Date.now()) / 86400000)
      return { f, days }
    })
    .filter((x) => x.days > 0 && x.days <= 10)
  const fdline =
    soon.length === 0
      ? 'No FDs maturing in 10d.'
      : `FD: *${soon[0]!.f.bank}* matures in *${soon[0]!.days}d*.`

  return [
    `*ARTHA — Daily digest*`,
    ``,
    `Net worth: *${formatCzk(nw)}* Kč`,
    `MoM: ${(mom.czk ?? 0) >= 0 ? '+' : ''}${formatCzk(mom.czk ?? 0)} Kč (${mom.pct == null ? 'n/a' : `${Number(mom.pct).toFixed(2)}%`})`,
    `Adherence (6m): *${(Number(adh.adherencePct) || 0).toFixed(0)}%*`,
    ``,
    action,
    ``,
    `*Alerts (since yesterday sample)*\n${al}`,
    ``,
    fdline,
    settings?.alertEmail && settings?.smtpUser
      ? `\n_Also sent to your alert email if SMTP is working._`
      : ''
  ].join('\n')
}

export async function startTelegramBot() {
  stopTelegramBot()
  const settings = await prisma.settings.findFirst()
  const token = (process.env.TELEGRAM_BOT_TOKEN || settings?.telegramBotToken || '').trim()
  if (!token) {
    // eslint-disable-next-line no-console
    console.log('[Telegram] No token, skipping bot start')
    return
  }
  try {
    botInstance = new TelegramBot(token, { polling: true })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Telegram] Failed to create bot', e)
    return
  }

  botInstance.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    const s0 = (await prisma.settings.findFirst()) || (await prisma.settings.create({ data: {} }))
    await prisma.settings.update({
      where: { id: s0.id },
      data: { telegramChatId: String(chatId) }
    })
    await botInstance!.sendMessage(
      chatId,
      '✓ ARTHA bot connected. Try /summary, /plan, /alert, /ai <question>'
    )
  })

  botInstance.onText(/\/summary/, async (msg) => {
    const s = await getPortfolioSummary()
    if (!s.success || !s.data) {
      await botInstance!.sendMessage(msg.chat.id, 'Portfolio not available right now.')
      return
    }
    const d = s.data
    const nw = d.netWorth?.totalCzk ?? 0
    const mom = d.momChange || { czk: 0, pct: 0 }
    const adh = await computeAdherenceStats(6)
    const text =
      `*ARTHA — Today*\n\n` +
      `Net worth: *${formatCzk(nw)}* Kč\n` +
      `MoM: ${(mom.czk ?? 0) >= 0 ? '+' : ''}${formatCzk(mom.czk ?? 0)} ` +
      `(${mom.pct == null ? 'n/a' : `${Number(mom.pct).toFixed(2)}%`})\n\n` +
      `Adherence (6m): ${(Number(adh.adherencePct) || 0).toFixed(0)}%\n` +
      `XIRR: ${
        d.xirr && d.xirr.value != null ? (Number(d.xirr.value) || 0).toFixed(2) + '%' : 'n/a'
      }`
    await botInstance!.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })

  botInstance.onText(/\/plan/, async (msg) => {
    const plan = await getPlanForMonth(currentMonthYear())
    if (!plan) {
      await botInstance!.sendMessage(msg.chat.id, 'No plan for this month yet.')
      return
    }
    const all = plan.allocations as unknown[]
    let text = `*Plan for ${plan.monthYear}*\n\n`
    if (!Array.isArray(all) || all.length === 0) {
      text += 'No rows.'
    } else {
      all.forEach((raw, i) => {
        const row = ensureRowType(raw)
        const status =
          (row.executionStatus || 'PENDING').toUpperCase() === 'DONE'
            ? '✓'
            : (row.executionStatus || 'PENDING').toUpperCase() === 'SKIPPED'
              ? '✗'
              : '○'
        const label =
          row.type === 'SELL'
            ? `SELL ${(row as { source?: string }).source || '—'}`
            : row.type === 'HOLD'
              ? `HOLD ${(row as { isin?: string }).isin || '—'}`
              : (row as { destination?: string }).destination || '—'
        const amt =
          row.type === 'HOLD'
            ? formatCzk(Number((row as { currentValueCzk?: number }).currentValueCzk) || 0)
            : formatCzk(Number(row.amountCzk) || 0)
        text += `${status} ${i + 1}. ${label.replace(/\*/g, '')}\n`
        text += `   ${amt} Kč — ${String(row.reason || '—')}\n\n`
      })
    }
    text += `Use /done <n> to mark a row done (1-based).`
    await botInstance!.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })

  botInstance.onText(/\/done (\d+)/, async (msg, match) => {
    const n = match && match[1] ? parseInt(match[1], 10) - 1 : -1
    if (!isFinite(n) || n < 0) {
      await botInstance!.sendMessage(msg.chat.id, 'Invalid row number')
      return
    }
    const plan = await getPlanForMonth(currentMonthYear())
    if (!plan) {
      await botInstance!.sendMessage(msg.chat.id, 'No plan for this month.')
      return
    }
    const all = plan.allocations as unknown
    if (!Array.isArray(all) || n >= all.length) {
      await botInstance!.sendMessage(msg.chat.id, 'Invalid row number')
      return
    }
    const row = ensureRowType(all[n])
    try {
      await markPlanRowDone(plan.id, n, { source: 'TELEGRAM' })
      const label =
        row.type === 'SELL' ? (row as { source?: string }).source || 'row' : (row as { destination?: string }).destination || 'row'
      await botInstance!.sendMessage(msg.chat.id, `✓ Marked row ${n + 1} as executed: ${String(label).replace(/</g, '')}`)
    } catch (e) {
      await botInstance!.sendMessage(
        msg.chat.id,
        `Failed: ${e instanceof Error ? e.message : 'error'}`
      )
    }
  })

  botInstance.onText(/\/alert/, async (msg) => {
    const logs = await prisma.alertLog
      .findMany({ orderBy: { firedAt: 'desc' }, take: 5 })
      .catch(() => [])
    if (logs.length === 0) {
      await botInstance!.sendMessage(msg.chat.id, 'No active alerts in log. All clear ✓')
      return
    }
    let text = `*Recent alerts*\n\n`
    ;(logs as { urgency?: string; title?: string; message?: string }[]).forEach((a) => {
      const t = (a.title || 'Alert').replace(/\*/g, '')
      const d = (a.message || '').replace(/\*/g, '')
      text += `${a.urgency || 'INFO'}: ${t}\n${d}\n\n`
    })
    await botInstance!.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })

  botInstance.onText(/\/ai (.+)/, async (msg, match) => {
    const q = (match && match[1] ? match[1] : '').trim()
    if (!q) {
      await botInstance!.sendMessage(msg.chat.id, 'Usage: /ai <question>')
      return
    }
    await botInstance!.sendMessage(msg.chat.id, '🤔 Thinking…')
    const s = await getPortfolioSummary()
    const set = await prisma.settings.findFirst()
    const mem = await askArtha(
      q,
      s.success && s.data ? s.data : {},
      {
        anthropicKey: (process.env.ANTHROPIC_API_KEY || '') as string,
        openaiKey: (set?.openaiApiKey || process.env.OPENAI_API_KEY || '') as string
      }
    )
    const ans = (mem as { aiResponse?: string }).aiResponse || '—'
    await botInstance!.sendMessage(msg.chat.id, ans)
  })

  // eslint-disable-next-line no-console
  console.log('[Telegram] Bot started, listening for commands')
}
