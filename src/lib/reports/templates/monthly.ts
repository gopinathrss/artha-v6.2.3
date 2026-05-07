import { getPrisma } from '../../prisma'
import { readPlanAllocationsOrEmpty } from '../../planAllocationsRead'
import { getPortfolioSummary } from '../../portfolio'
import { aiExecutiveSummary } from '../aiBrief'
import { esc, wrapReportHtml } from '../reportShell'

export async function generateMonthlyReport(period?: { start: Date; end: Date }): Promise<{
  html: string
  metadata: Record<string, unknown>
}> {
  const prisma = await getPrisma()
  const end = period?.end ? new Date(period.end) : new Date()
  const start = period?.start ? new Date(period.start) : new Date(end.getTime() - 30 * 86400000)

  const portfolio = await getPortfolioSummary()
  const nw = portfolio.success && portfolio.data ? portfolio.data.netWorth : null
  const prevSnaps = await prisma.snapshot.findMany({ orderBy: { date: 'desc' }, take: 14 })
  const prev = prevSnaps[1]
  const y1 = prevSnaps[12]
  const nwNow = nw ? Number(nw.totalCzk) : null
  const nwPrev = prev ? Number(prev.netWorthCzk) : null
  const nwY1 = y1 ? Number(y1.netWorthCzk) : null
  const chM =
    nwNow != null && nwPrev != null && nwPrev !== 0
      ? (((nwNow - nwPrev) / nwPrev) * 100).toFixed(2)
      : '—'
  const chY =
    nwNow != null && nwY1 != null && nwY1 !== 0 ? (((nwNow - nwY1) / nwY1) * 100).toFixed(2) : '—'

  const alloc = portfolio.success && portfolio.data ? portfolio.data.allocation : null
  const plan = await prisma.allocationPlan.findFirst({ orderBy: { generatedAt: 'desc' } })
  const rows = plan ? await readPlanAllocationsOrEmpty(plan) : []
  const done = rows.filter((r) => (r.executionStatus || 'PENDING').toUpperCase() === 'DONE').length
  const skipped = rows.filter((r) => (r.executionStatus || 'PENDING').toUpperCase() === 'SKIPPED').length
  const pend = rows.filter((r) => (r.executionStatus || 'PENDING').toUpperCase() === 'PENDING').length

  const since = new Date(start)
  const outcomes30 = await prisma.recommendationOutcome.findMany({
    where: { evaluatedAt30d: { gte: since } },
    take: 50
  })

  const lessons = await prisma.backtestLesson.findMany({
    where: { extractedAt: { gte: since } },
    orderBy: { extractedAt: 'desc' },
    take: 20
  })

  const nextMy = plan?.monthYear || ''

  const ctx = JSON.stringify({
    netWorthCzk: nwNow,
    changeVsPriorMonthPct: chM,
    changeVs12mPct: chY,
    allocation: alloc,
    planRows: rows.length,
    adherence: { done, skipped, pending: pend }
  })

  const exec = await aiExecutiveSummary(
    `Monthly PIE report context (JSON): ${ctx}. Summarize risks and positives for the user.`,
    3
  )

  const sections: { id: string; title: string; html: string }[] = [
    { id: 'exec', title: 'Executive summary', html: `<div class="section">${esc(exec)}</div>` },
    {
      id: 'nw',
      title: 'Net worth change',
      html: `<div class="section">Vs prior snapshot: <strong>${esc(String(chM))}%</strong> · vs ~12 months ago: <strong>${esc(String(chY))}%</strong></div>`
    },
    {
      id: 'alloc',
      title: 'Allocation drift',
      html: `<div class="section"><pre style="white-space:pre-wrap;font:inherit">${esc(JSON.stringify(alloc ?? {}, null, 2))}</pre></div>`
    },
    {
      id: 'adh',
      title: 'Plan adherence',
      html: `<div class="section">Rows done: ${done}, skipped: ${skipped}, pending: ${pend} (latest plan).</div>`
    },
    {
      id: 'out30',
      title: '30-day evaluations',
      html: `<div class="section">${outcomes30.length} outcomes with 30d evaluation timestamps in window.</div>`
    },
    {
      id: 'lessons',
      title: 'Lessons learned',
      html: `<div class="section">${lessons.length ? lessons.map((l: { isin: string; narrative: string }) => `<p><strong>${esc(l.isin)}</strong> — ${esc(l.narrative)}</p>`).join('') : 'No new lessons in this window.'}</div>`
    },
    {
      id: 'next',
      title: 'Next month preview',
      html: `<div class="section">Latest plan month: <strong>${esc(nextMy)}</strong>. Open /this-month for live rows.</div>`
    }
  ]

  const inner = sections.map((s) => `<h2>${esc(s.title)}</h2>${s.html}`).join('')
  const title = `Monthly review (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`
  const html = wrapReportHtml(title, inner)
  return {
    html,
    metadata: {
      title,
      reportType: 'MONTHLY',
      period: { start: start.toISOString(), end: end.toISOString() },
      generatedAt: new Date().toISOString(),
      sections: sections.map((s) => ({ id: s.id, title: s.title }))
    }
  }
}
