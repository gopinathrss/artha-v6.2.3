import { getPrisma } from '../../prisma'
import { getPortfolioSummary } from '../../portfolio'
import { aiExecutiveSummary } from '../aiBrief'
import { esc, wrapReportHtml } from '../reportShell'
import { runBacktest } from '../../backtest/engine'

export async function generateQuarterlyReport(period?: { start: Date; end: Date }): Promise<{
  html: string
  metadata: Record<string, unknown>
}> {
  const end = period?.end ? new Date(period.end) : new Date()
  const start = period?.start ? new Date(period.start) : new Date(end.getTime() - 90 * 86400000)

  const prisma = await getPrisma()
  const portfolio = await getPortfolioSummary()
  const snaps = await prisma.snapshot.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' }
  })

  const initial = 100_000
  const [current, allEq, bal] = await Promise.all([
    runBacktest({
      strategy: 'CURRENT_PORTFOLIO',
      startDate: start,
      endDate: end,
      initialValueCzk: initial,
      rebalanceFrequencyDays: 0
    }),
    runBacktest({
      strategy: 'ALL_EQUITY_VWCE',
      startDate: start,
      endDate: end,
      initialValueCzk: initial
    }),
    runBacktest({
      strategy: 'CUSTOM',
      holdings: [
        { isin: 'IE00BK5BQT80', weightPct: 60 },
        { isin: 'IE00BDBRDM35', weightPct: 30 },
        { isin: 'CZ0008472271', weightPct: 10 }
      ],
      startDate: start,
      endDate: end,
      initialValueCzk: initial,
      rebalanceFrequencyDays: 90
    })
  ])

  const out90 = await prisma.recommendationOutcome.findMany({
    where: { status: 'EXECUTED_90D', evaluatedAt90d: { gte: start, lte: end } },
    take: 100
  })

  const lessons = await prisma.backtestLesson.findMany({
    where: { extractedAt: { gte: start, lte: end } },
    take: 200
  })
  const patCounts = new Map<string, number>()
  for (const l of lessons) {
    for (const p of l.patternIds || []) {
      patCounts.set(p, (patCounts.get(p) || 0) + 1)
    }
  }
  const topPat = [...patCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  const ctx = JSON.stringify({
    backtest: {
      currentCagr: current.cagr,
      vwceCagr: allEq.cagr,
      balancedCagr: bal.cagr
    },
    snapshots: snaps.length,
    outcomes90: out90.length
  })

  const exec = await aiExecutiveSummary(
    `Quarterly PIE report. JSON: ${ctx}. Compare discipline vs benchmarks and name one behavioral takeaway.`,
    5
  )

  const sections = [
    { id: 'exec', title: 'Executive summary', html: `<div class="section">${esc(exec)}</div>` },
    {
      id: 'nw',
      title: 'Net worth trajectory (quarter)',
      html: `<div class="section">${snaps.length} snapshots in range. Latest total CZK: ${esc(String(portfolio.success && portfolio.data ? portfolio.data.netWorth.totalCzk : '—'))}</div>`
    },
    {
      id: 'bt',
      title: 'Backtest comparison (100k CZK, same window)',
      html: `<div class="section"><table><thead><tr><th>Strategy</th><th>CAGR %</th><th>Max DD %</th></tr></thead><tbody>
        <tr><td>Current</td><td>${esc(current.cagr.toFixed(2))}</td><td>${esc(current.maxDrawdown.toFixed(2))}</td></tr>
        <tr><td>VWCE</td><td>${esc(allEq.cagr.toFixed(2))}</td><td>${esc(allEq.maxDrawdown.toFixed(2))}</td></tr>
        <tr><td>60/30/10</td><td>${esc(bal.cagr.toFixed(2))}</td><td>${esc(bal.maxDrawdown.toFixed(2))}</td></tr>
      </tbody></table></div>`
    },
    {
      id: 'alloc',
      title: 'Allocation evolution',
      html: `<div class="section">See /portfolio for live sleeve weights; this quarter had ${esc(String(snaps.length))} stored snapshots.</div>`
    },
    {
      id: 'out',
      title: '90-day outcomes (window)',
      html: `<div class="section">${esc(String(out90.length))} completed 90d evaluations in the quarter window.</div>`
    },
    {
      id: 'pat',
      title: 'Pattern citations (lessons)',
      html: `<div class="section">${topPat.length ? topPat.map(([k, v]) => `<p>${esc(k)}: ${v}</p>`).join('') : 'No pattern IDs recorded on lessons this quarter.'}</div>`
    },
    {
      id: 'beh',
      title: 'Behavioral analysis',
      html: `<div class="section">Executed vs skipped mix in outcomes above; correlate with plan row adherence on /this-month.</div>`
    },
    {
      id: 'fwd',
      title: 'Forward 3-month plan',
      html: `<div class="section">Maintain SIP cadence; refresh historical NAV import after major market stress; review tax windows before rebalancing sells.</div>`
    }
  ]

  const inner = sections.map((s) => `<h2>${esc(s.title)}</h2>${s.html}`).join('')
  const title = `Quarterly review (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`
  return {
    html: wrapReportHtml(title, inner),
    metadata: {
      title,
      reportType: 'QUARTERLY',
      period: { start: start.toISOString(), end: end.toISOString() },
      generatedAt: new Date().toISOString(),
      sections: sections.map((s) => ({ id: s.id, title: s.title }))
    }
  }
}
