import { getPrisma } from '../../prisma'
import { getPortfolioSummary } from '../../portfolio'
import { calculateTaxStatus } from '../../calculations'
import { aiExecutiveSummary } from '../aiBrief'
import { esc, wrapReportHtml } from '../reportShell'
/** Czech tax year ending Dec 31; `period.end` should be last day of that year. */
export async function generateTaxYearReport(period?: { start: Date; end: Date }): Promise<{
  html: string
  metadata: Record<string, unknown>
}> {
  const prisma = await getPrisma()
  const end = period?.end
    ? new Date(period.end)
    : new Date(new Date().getFullYear() - 1, 11, 31, 23, 59, 59)
  const start = period?.start
    ? new Date(period.start)
    : new Date(end.getFullYear(), 0, 1)

  const holdings = await prisma.holding.findMany({ where: { status: { not: 'EXITED' } } })
  const today = new Date()
  const taxRows = holdings.map((h) => {
    const st = calculateTaxStatus(h, today)
    return {
      name: h.name,
      isin: h.isin,
      urgency: st.urgency,
      daysUntilTaxFree: st.daysUntilTaxFree,
      taxFree: st.isTaxFree
    }
  })

  const portfolio = await getPortfolioSummary()
  const indiaFunds = await prisma.indiaMutualFund.findMany().catch(() => [])

  const ctx = JSON.stringify({
    taxYearEnd: end.toISOString().slice(0, 10),
    holdings: taxRows.length,
    indiaFunds: indiaFunds.length
  })
  const exec = await aiExecutiveSummary(`Czech tax-year wrap-up. Context: ${ctx}. §4(1)(w) 3-year rule awareness.`, 4)

  const sections = [
    { id: 'exec', title: 'Executive summary', html: `<div class="section">${esc(exec)}</div>` },
    {
      id: 'realized',
      title: 'Realized gains / Czech 3-year status',
      html: `<div class="section"><table><thead><tr><th>Fund</th><th>ISIN</th><th>Window</th><th>Tax-free now</th></tr></thead><tbody>${taxRows
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${esc(r.isin)}</td><td>${esc(r.urgency)} (${r.daysUntilTaxFree}d)</td><td>${r.taxFree ? 'Yes' : 'No'}</td></tr>`
        )
        .join('')}</tbody></table><p class="muted">Realized gain ledger from brokers is not yet imported — use this as eligibility map only.</p></div>`
    },
    {
      id: 'taxfree',
      title: 'Tax-free dispositions (eligible)',
      html: `<div class="section">Funds marked tax-free under modeled dates: ${esc(String(taxRows.filter((t) => t.taxFree).length))}.</div>`
    },
    {
      id: 'taxable',
      title: 'Taxable window (within 3y model)',
      html: `<div class="section">Still inside modeled 3-year window: ${esc(String(taxRows.filter((t) => !t.taxFree).length))} positions.</div>`
    },
    {
      id: 'india',
      title: 'Indian income (MF / FD)',
      html: `<div class="section">${indiaFunds.length} India MF lines; use /india for NRE/NRO interest and FD maturity schedule.</div>`
    },
    {
      id: 'dtaa',
      title: 'DTAA-relevant items',
      html: `<div class="section">Cross-border interest and dividends: keep certificates of residence and treaty positions for Czech filing.</div>`
    },
    {
      id: 'nw',
      title: 'Net wealth change',
      html: `<div class="section">Current modeled net worth CZK: ${esc(String(portfolio.success && portfolio.data ? portfolio.data.netWorth.totalCzk : '—'))}</div>`
    },
    {
      id: 'rec',
      title: 'Next tax year',
      html: `<div class="section">Defer taxable sells into tax-free windows where possible; align rebalances with P-014 / P-022 pattern guidance.</div>`
    }
  ]

  const inner = sections.map((s) => `<h2>${esc(s.title)}</h2>${s.html}`).join('')
  const title = `Czech tax year ${start.getFullYear()} (model)`
  return {
    html: wrapReportHtml(title, inner),
    metadata: {
      title,
      reportType: 'TAX_YEAR',
      period: { start: start.toISOString(), end: end.toISOString() },
      generatedAt: new Date().toISOString(),
      sections: sections.map((s) => ({ id: s.id, title: s.title }))
    }
  }
}
