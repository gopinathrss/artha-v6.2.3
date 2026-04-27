import crypto from 'crypto'
import { prisma } from './prisma'
import { getPortfolioSummary } from './portfolio'

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function createReport(type: string, monthYear?: string | null) {
  const token = crypto.randomBytes(24).toString('hex')
  const portfolio = await getPortfolioSummary()
  const my = monthYear || new Date().toISOString().slice(0, 7)
  const dataSnapshot = {
    type: type || 'SNAPSHOT',
    monthYear: monthYear || null,
    periodLabel: my,
    portfolio: portfolio.success ? portfolio.data : null,
    generatedAt: new Date().toISOString()
  }
  const r = await prisma.generatedReport.create({
    data: {
      type: type || 'SNAPSHOT',
      periodLabel: String(dataSnapshot.periodLabel),
      monthYear: monthYear || null,
      dataSnapshot: dataSnapshot as object,
      token
    }
  })
  return { id: r.id, viewUrl: `/reports/view/${r.id}?token=${token}` }
}

export function renderReportViewHtml(row: {
  periodLabel: string
  type: string
  dataSnapshot: unknown
  createdAt: Date
}): string {
  const d = row.dataSnapshot
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ARTHA report — ${esc(row.type)}</title>
<style>
  :root { font-family: "JetBrains Mono", ui-monospace, monospace; --ink: #0a1628; --paper: #f7f3ea; }
  @media print { .no-print { display: none !important; } }
  body { margin: 0; color: var(--ink); background: var(--paper); }
  .wrap { max-width: 880px; margin: 0 auto; padding: 28px 20px; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 1.35rem; font-weight: 600; }
  .muted { color: #5a6578; font-size: 0.9rem; }
  pre { white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
  a { color: #1b4f8a; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="no-print"><a href="javascript:window.print()">Print / PDF</a></p>
    <h1>ARTHA — ${esc(row.type)}</h1>
    <p class="muted">${esc(String(row.periodLabel))} · Generated ${esc(new Date(row.createdAt).toISOString())}</p>
    <pre>${esc(typeof d === 'object' && d !== null ? JSON.stringify(d, null, 2) : String(d))}</pre>
  </div>
</body>
</html>`
}
