import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getPrisma } from './prisma'
import { buildReportData, type ReportAudience as PremAudience } from './reports/buildReportData'
import { renderTenSectionReportHtml, type ReportAudience } from './reportDocument'

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function reportTemplatePath(): string {
  const fromCwd = path.join(process.cwd(), 'src', 'dashboard', 'report-template.html')
  if (fs.existsSync(fromCwd)) return fromCwd
  return path.join(__dirname, '../dashboard/report-template.html')
}

function legacyJsonHtml(row: { periodLabel: string; type: string; dataSnapshot: unknown; createdAt: Date }): string {
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
    <h1>ARTHA — ${esc(row.type)} (legacy)</h1>
    <p class="muted">${esc(String(row.periodLabel))} · Generated ${esc(new Date(row.createdAt).toISOString())}</p>
    <pre>${esc(typeof d === 'object' && d !== null ? JSON.stringify(d, null, 2) : String(d))}</pre>
  </div>
</body>
</html>`
}

export async function createReport(
  type: string,
  monthYear: string | null | undefined,
  audience: ReportAudience
) {
  const token = crypto.randomBytes(24).toString('hex')
  const my = monthYear || new Date().toISOString().slice(0, 7)
  const reportType = type || 'CFO_10'
  const data = await buildReportData(reportType, my, audience as PremAudience)
  const dataSnapshot = {
    ...data,
    periodLabel: data.monthYear,
    generatedAt: data.generatedAtIso
  }

  const prisma = await getPrisma()
  const r = await prisma.generatedReport.create({
    data: {
      type: reportType,
      periodLabel: String(dataSnapshot.periodLabel),
      monthYear: my,
      dataSnapshot: dataSnapshot as object,
      token,
      audience
    }
  })
  return { id: r.id, viewUrl: `/reports/view/${r.id}?token=${token}` }
}

function renderPremiumReportHtml(snap: unknown): string {
  const raw = JSON.stringify(snap).replace(/</g, '\\u003c')
  const tpl = fs.readFileSync(reportTemplatePath(), 'utf8')
  if (!tpl.includes('__REPORT_JSON__')) {
    throw new Error('report-template.html: missing __REPORT_JSON__ placeholder')
  }
  return tpl.replace('__REPORT_JSON__', raw)
}

export function renderReportViewHtml(row: {
  periodLabel: string
  type: string
  dataSnapshot: unknown
  audience?: string | null
  createdAt: Date
  htmlContent?: string | null
  title?: string | null
}): string {
  if (row.htmlContent && String(row.htmlContent).trim().length > 0) {
    return String(row.htmlContent)
  }
  const snap = row.dataSnapshot as { version?: number; sections?: { id: string; title: string; html: string }[] } | null
  if (snap && snap.version === 3) {
    return renderPremiumReportHtml(snap)
  }
  if (snap && snap.version === 2 && Array.isArray(snap.sections) && snap.sections.length) {
    return renderTenSectionReportHtml({
      type: row.type,
      periodLabel: row.periodLabel,
      audience: row.audience || (snap as { audience?: string }).audience || 'INTERNAL',
      createdAt: row.createdAt,
      sections: snap.sections
    })
  }
  return legacyJsonHtml(row as { periodLabel: string; type: string; dataSnapshot: unknown; createdAt: Date })
}
