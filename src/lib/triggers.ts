import { getPrisma, realPrisma } from './prisma'
import { num } from './money'
import { getPortfolioSummary } from './portfolio'
import { calculateTaxStatus } from './calculations'
import {
  alertKeyForTrigger,
  fireAlertWithDedup,
  resolveInactiveTriggerAlerts
} from './alerts/dedup'

export interface FiredTrigger {
  triggerType: string
  title: string
  message: string
  urgency: string
  dataSnapshot?: unknown
}

export async function runAllTriggers(portfolioData: any): Promise<FiredTrigger[]> {
  const fired: FiredTrigger[] = []
  if (!portfolioData) return fired
  const now = new Date()
  const holdings: any[] = portfolioData.holdings || []
  for (const h of holdings) {
    if (h.status === 'EXITED') continue
    const t = calculateTaxStatus(h, now)
    if (t.daysUntilTaxFree > 0 && t.daysUntilTaxFree <= 30 && t.urgency !== 'FREE') {
      fired.push({
        triggerType: 'TAX_FREE_APPROACHING',
        title: `${h.name} tax event in ${t.daysUntilTaxFree} days`,
        message: `Holding value ${Math.round(h.currentValueCzk)} CZK. Review exit timing.`,
        urgency: t.urgency === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        dataSnapshot: { holdingId: h.id, isin: h.isin, days: t.daysUntilTaxFree }
      })
    }
  }
  const alloc = portfolioData.allocation
  if (alloc && Math.abs(alloc.equityGap) > 10) {
    fired.push({
      triggerType: 'ALLOCATION_DRIFT',
      title: `Equity ${alloc.equityPct.toFixed(1)}% vs target — drift ${alloc.equityGap.toFixed(1)}%`,
      message: 'Consider rebalancing or adjusting SIPs toward policy weights.',
      urgency: 'MEDIUM',
      dataSnapshot: alloc
    })
  }
  return fired
}

/**
 * Daily snapshot without Yahoo/NAV refresh — uses current DB state + FX.
 * Use when the machine may miss weekday 06:00 morning job (e.g. dev laptop off).
 */
export async function createDailySnapshot(): Promise<{ ok: boolean; error?: string }> {
  try {
    const summary = await getPortfolioSummary()
    if (!summary.success || !summary.data) {
      return { ok: false, error: summary.error || 'Portfolio load failed' }
    }
    await saveDailySnapshotFromPortfolio(summary.data)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function saveDailySnapshotFromPortfolio(data: any) {
  const nw = data?.netWorth
  if (!nw) return
  const prisma = await getPrisma()
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const a = data.allocation || { equityPct: 0, bondsPct: 0, cashPct: 0 }
  const gainPct = nw.inflowWeightedGainPct ?? 0
  await prisma.snapshot.upsert({
    where: { date: day },
    update: {
      netWorthCzk: nw.totalCzk,
      netWorthEur: nw.totalEur ?? 0,
      investedCzk: data.totalInvested ?? 0,
      gainCzk: nw.inflowWeightedGainCzk ?? 0,
      gainPct,
      xirr: data.xirr?.displayValue,
      xirrIsEstimate: data.xirr?.isEstimate !== false,
      equityPct: a.equityPct,
      bondsPct: a.bondsPct,
      cashPct: a.cashPct,
      healthScore: data.health?.score ?? 0,
      confidenceScore: typeof data.confidence === 'number' ? data.confidence : 0
    },
    create: {
      date: day,
      netWorthCzk: nw.totalCzk,
      netWorthEur: nw.totalEur ?? 0,
      investedCzk: data.totalInvested ?? 0,
      gainCzk: nw.inflowWeightedGainCzk ?? 0,
      gainPct,
      xirr: data.xirr?.displayValue,
      xirrIsEstimate: data.xirr?.isEstimate !== false,
      equityPct: a.equityPct,
      bondsPct: a.bondsPct,
      cashPct: a.cashPct,
      healthScore: data.health?.score ?? 0,
      confidenceScore: typeof data.confidence === 'number' ? data.confidence : 0
    }
  })
}

function mapUrgencyToSeverity(u: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (u === 'CRITICAL') return 'CRITICAL'
  if (u === 'HIGH') return 'HIGH'
  if (u === 'INFO') return 'LOW'
  return 'MEDIUM'
}

/** Fire triggers with deduplication + resolve stale keys (no FX / NAV refresh). */
export async function evaluateAlertTriggersOnly(): Promise<{ fired: number; alertsCreated: number }> {
  const summary = await getPortfolioSummary()
  if (!summary.success || !summary.data) {
    return { fired: 0, alertsCreated: 0 }
  }
  const triggers = await runAllTriggers(summary.data)
  const settings = await realPrisma.settings.findFirst()
  let alertsCreated = 0
  const activeKeys = new Set<string>()
  for (const tr of triggers) {
    const key = alertKeyForTrigger(tr)
    activeKeys.add(key)
    const r = await fireAlertWithDedup({
      alertKey: key,
      severity: mapUrgencyToSeverity(tr.urgency),
      category: tr.triggerType,
      message: tr.message,
      title: tr.title,
      metadata: tr.dataSnapshot
    })
    if (r.created) {
      alertsCreated += 1
      await deliverAlert({ ...tr, id: r.alertId } as any, settings)
    }
  }
  await resolveInactiveTriggerAlerts(activeKeys)
  return { fired: triggers.length, alertsCreated }
}

export async function runMorningJob(): Promise<{
  triggered: number
  errors: string[]
  alertsCreated: number
}> {
  const errors: string[] = []
  let triggered = 0
  let alertsCreated = 0
  try {
    const summary = await getPortfolioSummary()
    if (!summary.success || !summary.data) {
      errors.push(summary.error || 'Portfolio load failed')
      return { triggered: 0, errors, alertsCreated: 0 }
    }
    const portfolio = summary.data
    const { fetchYahooPrice, getFXRates } = await import('./fetchers')
    await getFXRates()

    const prisma = await getPrisma()
    const holdings = await prisma.holding.findMany({ where: { status: { not: 'EXITED' } } })
    for (const h of holdings) {
      const instrument = await prisma.instrumentLibrary.findFirst({ where: { isin: h.isin } })
      if (instrument?.ticker) {
        const price = await fetchYahooPrice(instrument.ticker)
        if (price != null && price > 0) {
          await prisma.holding.update({
            where: { id: h.id },
            data: { nav: price, currentValueCzk: Math.round(num(h.units) * price) }
          })
        }
      }
    }

    const refreshed = await getPortfolioSummary()
    if (!refreshed.success || !refreshed.data) {
      errors.push(refreshed.error || 'Refresh failed')
      return { triggered, errors, alertsCreated }
    }
    const p = refreshed.data
    const triggers = await runAllTriggers(p)
    triggered = triggers.length

    const settings = await realPrisma.settings.findFirst()
    const activeKeys = new Set<string>()
    for (const tr of triggers) {
      const key = alertKeyForTrigger(tr)
      activeKeys.add(key)
      const r = await fireAlertWithDedup({
        alertKey: key,
        severity: mapUrgencyToSeverity(tr.urgency),
        category: tr.triggerType,
        message: tr.message,
        title: tr.title,
        metadata: tr.dataSnapshot
      })
      if (r.created) {
        alertsCreated += 1
        await deliverAlert({ ...tr, id: r.alertId } as any, settings)
      }
    }
    await resolveInactiveTriggerAlerts(activeKeys)
    await saveDailySnapshotFromPortfolio(p)

    try {
      const { computeCapitalEfficiency } = await import('./intelligence/sleepingMoneyEngine')
      const { maybeFireSleepingMoneyAlert } = await import('./cron/sleepingMoneyAlert')
      const ceReport = await computeCapitalEfficiency(prisma)
      await maybeFireSleepingMoneyAlert(prisma, ceReport)
    } catch (e: unknown) {
      errors.push(`sleeping-money: ${e instanceof Error ? e.message : String(e)}`)
    }
  } catch (e: any) {
    errors.push(e?.message || String(e))
  }
  return { triggered, errors, alertsCreated }
}

export async function deliverAlert(
  trigger: { id?: string; title: string; message: string; triggerType: string; urgency: string },
  settings: { alertEmail?: string | null; alertsEnabled?: boolean } | null
) {
  if (settings?.alertsEnabled === false) return
  if (!settings?.alertEmail) return
  const { sendEmail } = await import('./emailService')
  await sendEmail(
    settings.alertEmail,
    `[PIE] ${trigger.title}`,
    `<p><strong>${trigger.title}</strong></p><p>${trigger.message}</p><p><small>${trigger.triggerType}</small></p>`
  ).catch(() => {})
  if (trigger.id) {
    const prisma = await getPrisma()
    await prisma.alertLog
      .update({ where: { id: trigger.id }, data: { wasSent: true, sentAt: new Date(), sentViaEmail: true } })
      .catch(() => {})
  }
}

export async function generateAndSendMonthlyLetter(portfolio: any, settings: any) {
  const { sendEmail } = await import('./emailService')
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=DM+Sans&display=swap" rel="stylesheet">
  <style>body{background:#FAF8F5;font-family:'DM Sans',system-ui;padding:32px;color:#1A1614}
  h1{font-family:'Playfair Display',Georgia,serif;color:#0F1E3C}
  .num{font-family:Georgia,serif;color:#B8922A;font-size:28px}
  </style></head><body>
  <h1>PIE — ${monthYear}</h1>
  <p>Net worth: <span class="num">${Math.round(portfolio?.netWorth?.totalCzk ?? 0).toLocaleString('cs-CZ')}</span> CZK</p>
  <p>Automated letter from your local PIE instance.</p>
  </body></html>`

  if (settings?.alertEmail) {
    await sendEmail(settings.alertEmail, `PIE monthly — ${monthYear}`, html)
  }
  const key = new Date().toISOString().slice(0, 7)
  const prisma = await getPrisma()
  await prisma.monthlyLetter.upsert({
    where: { monthYear: key },
    update: { contentHtml: html, contentText: html.replace(/<[^>]+>/g, ' '), portfolioSnapshot: portfolio, generatedAt: new Date() },
    create: {
      monthYear: key,
      generatedAt: new Date(),
      contentHtml: html,
      contentText: html.replace(/<[^>]+>/g, ' '),
      portfolioSnapshot: portfolio,
      wasSent: true,
      sentAt: new Date()
    }
  })
}

export async function runWeeklyBackup() {
  // Placeholder: in production, dump DB or copy files
  // eslint-disable-next-line no-console
  console.log('[PIE] Weekly backup placeholder (configure backup target separately)')
}
