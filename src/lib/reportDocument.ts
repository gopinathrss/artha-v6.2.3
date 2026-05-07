import type { UserProfile } from '@prisma/client'

export type ReportAudience = 'INTERNAL' | 'CLIENT'

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fmtK(n: number, client: boolean) {
  const v = client ? Math.round(n / 1000) * 1000 : Math.round(n)
  return v.toLocaleString('cs-CZ') + ' Kč'
}

function pct(n: number) {
  return (Number(n) || 0).toFixed(1) + '%'
}

function holdingLabel(h: { name: string; category: string }, i: number, client: boolean) {
  if (client) {
    return `Position ${i + 1} (${esc(h.category)})`
  }
  return esc(h.name)
}

export function buildReportSections(
  portfolio: { success: boolean; data: Record<string, any> | null },
  profile: UserProfile | null,
  monthYear: string,
  audience: ReportAudience
): { id: string; title: string; html: string }[] {
  const client = audience === 'CLIENT'
  const p = portfolio.success && portfolio.data ? (portfolio.data as Record<string, any>) : null
  const displayName = client
    ? 'Household'
    : esc((profile?.fullName || 'You').trim() || 'Household')
  const nw = p?.netWorth
  const total = nw?.totalCzk ?? 0
  const mom = (p?.momChange || { czk: 0, pct: 0, label: '' }) as {
    czk?: number | null
    pct?: number | null
    label?: string
  }
  const a = p?.allocation
  const tEq = p?.settings?.targetEquityPct ?? 65
  const tBd = p?.settings?.targetBondsPct ?? 25
  const tCa = p?.settings?.targetCashPct ?? 10
  const xirr = p?.xirr
  const health = p?.health
  const conf = p?.confidence
  const goalFV = p?.goalFV
  const proj = p?.projectedFV
  const tax = (p?.taxCalendar || []).slice(0, 8)
  const holdings = p?.holdings || []
  const snaps = p?.snapshots || []
  const fx = p?.fxRates

  const s1 = client
    ? `<p>This client report uses <strong>aggregated, rounded figures</strong> and generic position labels. It is suitable for external sharing. Not investment advice.</p>`
    : `<p>Full-detail internal snapshot for <strong>${displayName}</strong>. Contains position names and precise figures for your records.</p>`

  const s2 = `<p>Total net worth: <strong>${fmtK(total, client)}</strong> (CZK headline).</p>
    <p>Month-over-month${mom.label ? ` (${esc(mom.label)})` : ''}: <strong>${mom.czk == null ? '—' : fmtK(mom.czk, client)}</strong>${mom.pct == null ? '' : ` (${pct(mom.pct)})`}.</p>
    <p>As of period: <strong>${esc(monthYear)}</strong>.</p>`

  const s3 = a
    ? `<p>Policy: equity ${pct(tEq)} · bonds ${pct(tBd)} · cash ${pct(tCa)}.</p>
    <p>Actual: equity ${pct(a.equityPct)} · bonds ${pct(a.bondsPct)} · cash ${pct(a.cashPct)}.</p>
    <div class="barrow" aria-label="Equity vs target"><span>Equity</span><div class="bar"><i style="width:${Math.min(100, a.equityPct)}%"></i><em style="left:${tEq}%"></em></div></div>
    <div class="barrow"><span>Bonds</span><div class="bar"><i class="bd" style="width:${Math.min(100, a.bondsPct)}%"></i><em class="bd" style="left:${tBd}%"></em></div></div>
    <div class="barrow"><span>Cash</span><div class="bar"><i class="ca" style="width:${Math.min(100, a.cashPct)}%"></i><em class="ca" style="left:${tCa}%"></em></div></div>
    <p class="muted">Gap (equity): ${pct(a.equityGap)} pp vs target.</p>`
    : `<p class="muted">Allocation unavailable (load portfolio).</p>`

  const rows = holdings.slice(0, 12).map((h: Record<string, any>, i: number) => {
    const hold = { name: String(h.name ?? ''), category: String(h.category ?? '—') }
    const lab = holdingLabel(hold, i, client)
    return `<tr><td>${lab}</td><td class="right">${esc(h.category)}</td><td class="right mono">${fmtK(h.currentValueCzk, client)}</td></tr>`
  })
  const s4 =
    `<p>Active positions: <strong>${p?.activeCount ?? 0}</strong> (of ${p?.holdingsCount ?? 0} rows).</p>
    <table class="rep-tbl"><thead><tr><th>Name / label</th><th>Class</th><th class="right">Value</th></tr></thead><tbody>
    ${rows.length ? rows.join('') : '<tr><td colspan="3" class="muted">No holdings on file.</td></tr>'}</tbody></table>`

  let xirrLine =
    'IRR (money-weighted): not yet available — fewer than 12 months of cashflow history in the model window.'
  if (xirr?.displayState === 'OK' && xirr.displayValue != null) {
    xirrLine = `IRR (money-weighted, 12+ months of history): <strong>${(xirr.displayValue as number).toFixed(2)}%</strong>.`
  } else if (xirr?.displayState === 'ESTIMATE_HIDDEN') {
    xirrLine =
      'IRR: headline hidden — solver fell back to a short-horizon annualization; see docs/METHODOLOGY.md (not shown to avoid misleading figures).'
  } else if (xirr?.displayState === 'INSUFFICIENT_HISTORY') {
    xirrLine = `IRR: not yet shown — need at least ${xirr?.minMonthsForDisplay ?? 12} months of cashflow history (${xirr?.monthsOfHistory ?? 0} months recorded).`
  }
  const s5 = `<p>${xirrLine}</p>
    <p>Blended policy return (illustrative): ${pct(p?.blendedReturn ?? 0)}.</p>`

  const s6 = `<p>Czech + India notional in net worth (see overview for breakdown). Cash-like sleeves captured in allocation.</p>
    <p>FX reference: EURCZK ${fx?.EURCZK != null ? (fx as { EURCZK: number }).EURCZK.toFixed(2) : '—'} · EURINR ${fx?.EURINR != null ? (fx as { EURINR: number }).EURINR.toFixed(2) : '—'}.</p>`

  const s7 = `<p>Target wealth (if set): ${p?.settings?.targetWealthCzk != null ? fmtK(p.settings.targetWealthCzk, client) : 'not set'}.</p>
    <p>Projected FV (illustrative, ${client ? 'rounded' : 'model'}): ${proj != null ? fmtK(proj, client) : 'n/a'}.</p>
    <p>Implied goal check: ${goalFV != null ? fmtK(goalFV, client) : 'n/a'}.</p>
    <p>Recent snapshots: <strong>${snaps.length}</strong> months in window.</p>`

  const taxRows = tax
    .map((h: Record<string, any>) => {
      const name = client ? esc(h.category + ' position') : esc(h.name)
      const d = h.tax?.daysUntilTaxFree
      return `<tr><td>${name}</td><td class="right mono">${d == null ? '—' : d + 'd'}</td></tr>`
    })
    .join('')
  const s8 = `<p>Upcoming tax-related events (subset):</p>
    <table class="rep-tbl"><thead><tr><th>${client ? 'Bucket' : 'Holding'}</th><th class="right">Days to tax-free</th></tr></thead><tbody>
    ${taxRows || '<tr><td colspan="2" class="muted">No items.</td></tr>'}</tbody></table>`

  const s9 = `<p>System health score: <strong>${health?.score ?? '—'}</strong> · Confidence: <strong>${conf != null ? (conf as number).toFixed(0) : '—'}%</strong>.</p>
    <p class="muted">${client ? 'Figures are rounded; do not use for tax filing.' : 'Use Settings → Health for live checks.'}</p>`

  const s10 = client
    ? `<p><strong>Disclaimer:</strong> This report is for discussion only, not an offer or advice. Past performance does not guarantee future results. Verify all numbers independently.</p>
       <p>PIE — Client snapshot · ${esc(monthYear)}</p>`
    : `<p><strong>Next steps:</strong> Revisit /this-month for allocation follow-through, /finances for cashflow, /settings for delivery &amp; targets.</p>
       <p><strong>Disclaimer:</strong> For personal use; not regulated investment advice.</p>
       <p>PIE — Internal report · ${esc(monthYear)}</p>`

  return [
    { id: '1', title: '1 · Executive summary', html: s1 },
    { id: '2', title: '2 · Net worth & change', html: s2 },
    { id: '3', title: '3 · Allocation vs policy', html: s3 },
    { id: '4', title: '4 · Positions overview', html: s4 },
    { id: '5', title: '5 · Performance', html: s5 },
    { id: '6', title: '6 · Liquidity & FX context', html: s6 },
    { id: '7', title: '7 · Goals & trajectory', html: s7 },
    { id: '8', title: '8 · Tax timing (subset)', html: s8 },
    { id: '9', title: '9 · Health & confidence', html: s9 },
    { id: '10', title: '10 · Actions & disclaimers', html: s10 }
  ]
}

export function renderTenSectionReportHtml(params: {
  type: string
  periodLabel: string
  audience: string
  createdAt: Date
  sections: { id: string; title: string; html: string }[]
}): string {
  const badge =
    params.audience === 'CLIENT'
      ? '<span class="rep-badge rep-badge--client">Client-safe</span>'
      : '<span class="rep-badge rep-badge--int">Internal</span>'
  const body = params.sections
    .map(
      (s) => `
  <section class="rep-sec" id="sec-${esc(s.id)}">
    <h2>${esc(s.title)}</h2>
    <div class="rep-body">${s.html}</div>
  </section>`
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>PIE — ${esc(params.type)}</title>
<style>
  :root { --ink: #0a1628; --paper: #f7f3ea; --gold: #b8922a; --muted: #5a6578; --bd: #e8e4dc; }
  @page { size: A4; margin: 14mm; }
  @media print {
    .no-print { display: none !important; }
    .rep-sec { break-inside: avoid; page-break-inside: avoid; }
  }
  body { margin: 0; color: var(--ink); background: var(--paper); font-family: "DM Sans", system-ui, sans-serif; font-size: 13px; line-height: 1.45; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 28px 20px 40px; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 1.45rem; font-weight: 600; margin: 0 0 6px; }
  h2 { font-family: Fraunces, Georgia, serif; font-size: 1.05rem; font-weight: 600; margin: 22px 0 10px; color: #1a2332; border-bottom: 1px solid var(--bd); padding-bottom: 6px; }
  .muted { color: var(--muted); font-size: 0.92rem; }
  .rep-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .rep-badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--bd); }
  .rep-badge--int { background: rgba(184,146,42,0.12); border-color: rgba(184,146,42,0.4); }
  .rep-badge--client { background: rgba(10,122,88,0.1); border-color: rgba(10,122,88,0.35); }
  .rep-sec p { margin: 0.5em 0; }
  .rep-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  .rep-tbl th, .rep-tbl td { border-bottom: 1px solid var(--bd); padding: 7px 6px; text-align: left; }
  .rep-tbl th { font-weight: 600; color: #3a4150; }
  .right { text-align: right; }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
  .barrow { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; }
  .bar { position: relative; height: 10px; background: #ece8df; border-radius: 4px; overflow: hidden; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #b8922a, #d4a82e); width: 0; }
  .bar i.bd { background: linear-gradient(90deg, #1b3560, #2a4a7a); }
  .bar i.ca { background: linear-gradient(90deg, #0a7a8a, #0aa0b0); }
  .bar em { position: absolute; top: -2px; width: 2px; height: 14px; background: #c0392b; transform: translateX(-1px); }
  a { color: #1b4f8a; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="no-print"><a href="javascript:window.print()">Print / Save as PDF</a></p>
    <div class="rep-top">
      <div>
        <h1>PIE — ${esc(params.type)}</h1>
        <p class="muted">${esc(String(params.periodLabel))} · Generated ${esc(new Date(params.createdAt).toISOString().slice(0, 19))}Z</p>
      </div>
      ${badge}
    </div>
    ${body}
  </div>
</body>
</html>`
}
