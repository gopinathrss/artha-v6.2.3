import { prisma } from './prisma'
import { getPortfolioSummary } from './portfolio'
import { calculateTaxStatus } from './calculations'

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

export async function saveDailySnapshotFromPortfolio(data: any) {
  const nw = data?.netWorth
  if (!nw) return
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const a = data.allocation || { equityPct: 0, bondsPct: 0, cashPct: 0 }
  const gainPct = nw.gainPct ?? 0
  await prisma.snapshot.upsert({
    where: { date: day },
    update: {
      netWorthCzk: nw.totalCzk,
      netWorthEur: nw.totalEur ?? 0,
      investedCzk: data.totalInvested ?? 0,
      gainCzk: nw.gainCzk ?? 0,
      gainPct,
      xirr: data.xirr?.value,
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
      gainCzk: nw.gainCzk ?? 0,
      gainPct,
      xirr: data.xirr?.value,
      xirrIsEstimate: data.xirr?.isEstimate !== false,
      equityPct: a.equityPct,
      bondsPct: a.bondsPct,
      cashPct: a.cashPct,
      healthScore: data.health?.score ?? 0,
      confidenceScore: typeof data.confidence === 'number' ? data.confidence : 0
    }
  })
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

    const holdings = await prisma.holding.findMany({ where: { status: { not: 'EXITED' } } })
    for (const h of holdings) {
      const instrument = await prisma.instrumentLibrary.findFirst({ where: { isin: h.isin } })
      if (instrument?.ticker) {
        const price = await fetchYahooPrice(instrument.ticker)
        if (price != null && price > 0) {
          await prisma.holding.update({
            where: { id: h.id },
            data: { nav: price, currentValueCzk: Math.round(h.units * price) }
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

    const settings = await prisma.settings.findFirst()
    for (const tr of triggers) {
      const log = await prisma.alertLog.create({
        data: {
          triggerType: tr.triggerType,
          title: tr.title,
          message: tr.message,
          urgency: tr.urgency,
          dataSnapshot: tr.dataSnapshot as any,
          wasSent: false
        }
      })
      alertsCreated += 1
      await deliverAlert(
        { ...tr, id: log.id } as any,
        settings
      )
    }
    await saveDailySnapshotFromPortfolio(p)
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
    `[ARTHA] ${trigger.title}`,
    `<p><strong>${trigger.title}</strong></p><p>${trigger.message}</p><p><small>${trigger.triggerType}</small></p>`
  ).catch(() => {})
  if (trigger.id) {
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
  <h1>ARTHA — ${monthYear}</h1>
  <p>Net worth: <span class="num">${Math.round(portfolio?.netWorth?.totalCzk ?? 0).toLocaleString('cs-CZ')}</span> CZK</p>
  <p>Automated letter from your local Artha instance.</p>
  </body></html>`

  if (settings?.alertEmail) {
    await sendEmail(settings.alertEmail, `ARTHA monthly — ${monthYear}`, html)
  }
  const key = new Date().toISOString().slice(0, 7)
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
  console.log('[ARTHA] Weekly backup placeholder (configure backup target separately)')
}
