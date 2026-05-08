/**
 * /this-month — V5 rebuild.
 *
 * Reads /api/this-month, splits the plan into BUY / SELL / RESERVE / HOLD
 * groups, and renders each group as a section card containing one .plan-row
 * per allocation. PENDING rows expose Done/Skip; non-pending rows show a
 * status badge instead. Generate / Delete plan reuse the existing endpoints.
 *
 * Decimals from Prisma serialise as strings — every value that hits Math or
 * .toFixed must pass through Number() first (the bug that bricked the page in
 * Sprint 2). Helpers fmt0/fmt1 do this implicitly.
 */
;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const SELL_BADGE = {
    TAX_FREE_EXIT: 'positive',
    REBALANCE_DRIFT: 'warning',
    FD_MATURITY: 'info'
  }

  const ICON_BUY =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M8 13 V3 M3 8 L8 3 L13 8"/></svg>'
  const ICON_SELL =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M8 3 V13 M3 8 L8 13 L13 8"/></svg>'
  const ICON_RESERVE =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="7" width="8" height="6" rx="1"/><path d="M6 7 V5 A2 2 0 0 1 10 5 V7"/></svg>'

  let currentPlan = null

  function strategyMonthFromStrategyApi(s) {
    const approvedAt = s.approvedAt || s.createdAt || s.proposedAt
    if (!approvedAt) return 1
    const ms = new Date(approvedAt).getTime()
    if (!Number.isFinite(ms)) return 1
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24 * 30.4)) + 1
  }

  async function loadPriorMonthCard() {
    const slot = document.getElementById('prior-month-slot')
    if (!slot) return
    try {
      const res = await fetch('/api/outcomes/prior-month-summary').then((r) => r.json())
      const d = res?.data
      if (!d?.show) {
        slot.innerHTML = ''
        return
      }
      const pct = d.followedPct != null ? `${d.followedPct}%` : '—'
      const best =
        d.best != null
          ? `${escapeHtml(d.best.fundName)} (${Number(d.best.gainPct).toFixed(1)}%)`
          : '—'
      const worst =
        d.worst != null
          ? `${escapeHtml(d.worst.fundName)} (${Number(d.worst.gainPct).toFixed(1)}%)`
          : '—'
      slot.innerHTML = `
        <section class="card" style="margin-top: var(--space-5);">
          <div class="card-header">
            <div>
              <h2 class="card-title">Last month’s plan — how it played out</h2>
              <p class="card-subtitle">Plan ${escapeHtml(d.monthYear || '')} · ${Number(d.evaluatedCount) || 0} evaluated rows</p>
            </div>
          </div>
          <div style="padding: 0 var(--space-5) var(--space-5)">
            <div class="hero-stats" style="grid-template-columns: repeat(3, 1fr); margin-bottom: var(--space-4)">
              <div class="hero-stat">
                <div class="hero-stat-label">Followed</div>
                <div class="hero-stat-value">${pct}</div>
              </div>
              <div class="hero-stat">
                <div class="hero-stat-label">Best outcome</div>
                <div class="hero-stat-value" style="font-size: var(--text-sm)">${best}</div>
              </div>
              <div class="hero-stat">
                <div class="hero-stat-label">Worst outcome</div>
                <div class="hero-stat-value" style="font-size: var(--text-sm)">${worst}</div>
              </div>
            </div>
            <a class="btn btn-secondary btn-sm" href="/reports#track-record">View full track record →</a>
          </div>
        </section>`
    } catch {
      slot.innerHTML = ''
    }
  }

  async function load() {
    const ph = window.PiePageHealth
    try {
      const [res, stratRes, ovRes] = await Promise.all([
        fetch('/api/this-month').then((r) => r.json()),
        fetch('/api/strategies').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/overview').then((r) => r.json()).catch(() => ({ data: {} }))
      ])
      const plan = res?.data?.plan || null
      currentPlan = plan
      const holdings = ovRes?.data?.holdings || []
      const holdingIsins = new Set((holdings || []).map((h) => h && h.isin).filter(Boolean))
      const holdingMap = {}
      for (const h of holdings || []) {
        if (h && h.isin) holdingMap[h.isin] = h.name || h.isin
      }
      /** @type {Record<string, object>} */
      const strategyByIsin = {}
      if (stratRes?.success && Array.isArray(stratRes.data)) {
        for (const s of stratRes.data) {
          const isin = s.holding?.isin
          if (isin && (s.status === 'APPROVED' || s.status === 'MONITORING')) strategyByIsin[isin] = s
        }
      }
      if (!plan || !Array.isArray(plan.allocations)) {
        renderEmpty()
        await loadPriorMonthCard()
        if (ph) ph.updatePageHealthDot('thisMonth', null, false, 'No plan generated yet')
        return
      }
      renderSummary(plan)
      renderRows(plan, strategyByIsin, holdingIsins, holdingMap)
      await loadPriorMonthCard()
      if (ph) {
        const planAge = plan.generatedAt || null
        const tt =
          planAge != null
            ? `Plan generated ${new Date(planAge).toLocaleDateString('cs-CZ')}`
            : 'Plan loaded'
        ph.updatePageHealthDot('thisMonth', planAge || new Date().toISOString(), false, tt)
      }
    } catch (e) {
      renderEmpty()
      await loadPriorMonthCard()
      if (ph) ph.updatePageHealthDot('thisMonth', null, true, 'Failed to load plan')
    }
  }

  function renderEmpty() {
    document.getElementById('summary-card').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">No plan generated for this month yet.</div>
        <button class="btn btn-primary" id="btn-generate-empty" type="button">Generate plan</button>
      </div>
    `
    document.getElementById('rows-container').innerHTML = ''
    document.getElementById('btn-generate-empty')?.addEventListener('click', generatePlan)
  }

  function renderSummary(plan) {
    const allocs = plan.allocations || []
    const done = allocs.filter((a) => a.executionStatus === 'DONE').length
    const skipped = allocs.filter((a) => a.executionStatus === 'SKIPPED').length
    const open = allocs.filter((a) => a.executionStatus === 'PENDING').length
    const tracked = allocs.filter((a) => a.type === 'BUY' || a.type === 'SELL').length
    const adherence = tracked > 0 ? Math.round((done / tracked) * 100) : 0

    const statusLabel = plan.status === 'PROPOSED' ? 'Proposed' : plan.status || ''
    const investable = Number(plan.investableCzk) || 0
    const totalAvail = Number(plan.totalAvailableCzk) || 0
    const fixedExp = Number(plan.fixedExpensesCzk) || 0
    const reservedEv = Number(plan.reservedEventsCzk) || 0

    document.getElementById('summary-card').innerHTML = `
      <div class="card-header">
        <div>
          <h2 class="card-title">Active plan</h2>
          <p class="card-subtitle">${escapeHtml(plan.monthYear || '')} · ${escapeHtml(statusLabel)}</p>
        </div>
        ${
          plan.status === 'PROPOSED'
            ? '<button class="btn btn-ghost btn-sm" id="btn-delete-plan" type="button">Delete plan</button>'
            : ''
        }
      </div>

      <div class="hero-eyebrow" style="margin-top: var(--space-3);">Investable this month</div>
      <div class="hero-value-row">
        <div class="hero-value">${fmt0(investable)} Kč</div>
      </div>
      <div class="hero-meta">
        Available ${fmt0(totalAvail)} · Fixed ${fmt0(fixedExp)} · Reserved ${fmt0(reservedEv)}
      </div>

      <div class="hero-stats" style="grid-template-columns: repeat(4, 1fr);">
        <div class="hero-stat">
          <div class="hero-stat-label">Adherence</div>
          <div class="hero-stat-value">${adherence}%</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-label">Done</div>
          <div class="hero-stat-value">${done}</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-label">Skipped</div>
          <div class="hero-stat-value">${skipped}</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-label">Open</div>
          <div class="hero-stat-value">${open}</div>
        </div>
      </div>
    `

    document.getElementById('btn-delete-plan')?.addEventListener('click', deletePlan)
  }

  function renderRows(plan, strategyByIsin, holdingIsins, holdingMap) {
    const byIsin = strategyByIsin || {}
    const allocs = plan.allocations || []
    const sells = allocs.filter((a) => a.type === 'SELL')
    const reserves = allocs.filter((a) => a.type === 'RESERVE')
    const buys = allocs.filter((a) => a.type === 'BUY')
    const holds = allocs.filter((a) => a.type === 'HOLD')

    const sum = (arr) => arr.reduce((s, a) => s + (Number(a.amountCzk) || 0), 0)
    const html = []

    if (sells.length > 0) {
      html.push(
        sectionCard(
          'Sells (free up cash)',
          `${sells.length} ${sells.length === 1 ? 'action' : 'actions'} · ${fmt0(sum(sells))} Kč freed`,
          sells.map((r) => rowActionable(r, byIsin, holdingIsins, holdingMap)).join('')
        )
      )
    }
    if (reserves.length > 0) {
      html.push(
        sectionCard(
          'Reserves',
          `For upcoming events · ${fmt0(sum(reserves))} Kč`,
          reserves.map((r) => rowActionable(r, byIsin, holdingIsins, holdingMap)).join('')
        )
      )
    }
    if (buys.length > 0) {
      html.push(
        sectionCard(
          'Buys (deploy investable)',
          `${buys.length} ${buys.length === 1 ? 'action' : 'actions'} · ${fmt0(sum(buys))} Kč deployed`,
          buys.map((r) => rowActionable(r, byIsin, holdingIsins, holdingMap)).join('')
        )
      )
    }
    if (holds.length > 0) {
      html.push(
        sectionCard(
          'Holds (no action)',
          `${holds.length} ${holds.length === 1 ? 'holding' : 'holdings'} unchanged`,
          holds.map((r) => rowHold(r, holdingMap)).join('')
        )
      )
    }

    document.getElementById('rows-container').innerHTML = html.join('')
    attachRowHandlers()
  }

  function sectionCard(title, subtitle, body) {
    return `
      <section class="card" style="margin-bottom: var(--space-5);">
        <div class="card-header">
          <div>
            <h2 class="card-title">${escapeHtml(title)}</h2>
            <p class="card-subtitle">${escapeHtml(subtitle)}</p>
          </div>
        </div>
        ${body}
      </section>
    `
  }

  function renderReasonCollapsed(text, maxLen = 100) {
    const t = String(text || '')
    if (!t) return ''
    if (t.length <= maxLen) return escapeHtml(t)
    const short = t.slice(0, maxLen).trim()
    return (
      '<span class="reasoning-preview">' +
      escapeHtml(short) +
      '… ' +
      '<button class="btn-link reasoning-toggle" type="button" onclick="toggleReasoningText(this)">' +
      'Show more ▼' +
      '</button>' +
      '</span>' +
      '<span class="reasoning-full" style="display:none">' +
      escapeHtml(t) +
      '</span>'
    )
  }

  window.toggleReasoningText = function toggleReasoningText(btn) {
    try {
      const wrap = btn && btn.parentElement ? btn.parentElement : null
      if (!wrap) return
      const full = wrap.parentElement && wrap.parentElement.querySelector
        ? wrap.parentElement.querySelector('.reasoning-full')
        : null
      if (!full) return
      const isHidden = full.style.display === 'none' || full.style.display === ''
      full.style.display = isHidden ? 'inline' : 'none'
      btn.textContent = isHidden ? 'Show less ▲' : 'Show more ▼'
    } catch {
      /* */
    }
  }

  function rowActionable(row, strategyByIsin, holdingIsins, holdingMap) {
    const name =
      row.type === 'SELL'
        ? row.source || row.name || row.isin || '—'
        : row.destination || row.name || row.title || row.isin || '—'

    const icon =
      row.type === 'BUY' ? ICON_BUY : row.type === 'SELL' ? ICON_SELL : ICON_RESERVE

    const badgeColor = SELL_BADGE[row.sellSubtype] || 'neutral'
    const badge = row.sellSubtype
      ? `<span class="badge badge-${badgeColor}">${escapeHtml(row.sellSubtype.replace(/_/g, ' '))}</span>`
      : ''

    let strategyBadge = ''
    if (row.type === 'BUY' && strategyByIsin && row.isin) {
      const reasonText = row.reason || ''
      const isStrategyBuy =
        reasonText.includes('[Strategy:') || reasonText.includes('Approved strategy')
      const st = strategyByIsin[row.isin]
      if (isStrategyBuy && st) {
        const cm = strategyMonthFromStrategyApi(st)
        const mt = Number(st.monthsToTarget) || 0
        strategyBadge = `<span class="badge badge-strategy" title="Strategy: month ${cm} of ${mt}">Month ${cm}/${mt}</span>`
      }
    }

    const taxLine =
      row.type === 'SELL' && row.taxImpactCzk !== undefined && row.taxImpactCzk !== null
        ? `<div class="plan-row-tax">Tax: ${
            Number(row.taxImpactCzk) === 0
              ? '<span class="text-positive">0 Kč</span>'
              : fmt0(row.taxImpactCzk) + ' Kč'
          }</div>`
        : ''

    const status = row.executionStatus
    const actions =
      status === 'PENDING'
        ? `<div class="plan-row-actions">
             <button class="btn btn-secondary btn-sm" data-action="done" data-key="${escapeHtml(row.rowKey)}" type="button">Done</button>
             <button class="btn btn-ghost btn-sm" data-action="skip" data-key="${escapeHtml(row.rowKey)}" type="button">Skip</button>
           </div>`
        : `<div class="plan-row-actions">
             <span class="badge badge-${status === 'DONE' ? 'positive' : 'neutral'}">${status === 'DONE' ? 'Done' : 'Skipped'}</span>
           </div>`

    const isinLine =
      row.type === 'BUY' && row.isin
        ? `<span class="fund-isin">${escapeHtml(String(row.isin))}</span>`
        : ''

    const isNew = row.type === 'BUY' && row.isin && holdingIsins && !holdingIsins.has(row.isin)
    const newBadge = isNew ? '<span class="badge badge--new">NEW</span>' : ''

    return `
      <div class="plan-row" data-row-key="${escapeHtml(row.rowKey)}">
        <div class="plan-row-icon plan-row-icon-${row.type}">${icon}</div>
        <div class="plan-row-main">
          <div class="plan-row-title-line">
            <span class="plan-row-name">${escapeHtml(name)}</span>
            ${newBadge}
            ${strategyBadge}
            ${badge}
          </div>
          ${isinLine}
          <div class="plan-row-reason">${renderReasonCollapsed(row.reason || '')}</div>
          ${taxLine}
        </div>
        <div class="plan-row-amount">${fmt0(row.amountCzk)} Kč</div>
        ${actions}
      </div>
    `
  }

  function rowHold(row, holdingMap) {
    const days = row.daysToAction
    const daysBadge = days != null ? `<span class="badge badge-info">${escapeHtml(String(days))}d</span>` : ''
    const hr = row.holdReason ? String(row.holdReason).toUpperCase() : ''
    const holdBadge =
      hr && hr !== 'NONE'
        ? `<span class="badge badge-${hr === 'STRATEGY_CAP' ? 'warning' : 'neutral'}">${escapeHtml(
            hr.replace(/_/g, ' ')
          )}</span>`
        : ''
    const isin = row.isin || ''
    const nm = (holdingMap && isin && holdingMap[isin]) || row.name || isin || '—'
    return `
      <div class="plan-row plan-row-hold">
        <div class="plan-row-icon plan-row-icon-hold">·</div>
        <div class="plan-row-main">
          <div class="plan-row-title-line">
            <span class="plan-row-name plan-row-name-muted">${escapeHtml(nm)}</span>
            ${daysBadge}
            ${holdBadge}
          </div>
          ${isin ? `<span class="fund-isin">${escapeHtml(String(isin))}</span>` : ''}
          <div class="plan-row-reason">${escapeHtml(row.reason || '')}</div>
        </div>
        <div class="plan-row-amount plan-row-amount-muted">${fmt0(row.currentValueCzk || 0)} Kč</div>
      </div>
    `
  }

  function attachRowHandlers() {
    document.querySelectorAll('[data-action="done"], [data-action="skip"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action')
        const key = btn.getAttribute('data-key')
        if (!currentPlan?.id || !key) return
        const allocs = currentPlan.allocations || []
        const idx = allocs.findIndex((r) => r.rowKey === key)
        if (idx < 0) return

        const body =
          action === 'done'
            ? {
                action: 'DONE',
                executedAmountCzk: Number(allocs[idx].amountCzk) || 0,
                executedAt: new Date().toISOString()
              }
            : { action: 'SKIPPED', skipReason: 'User skipped' }

        try {
          btn.disabled = true
          const res = await fetch(
            `/api/this-month/plan/${encodeURIComponent(currentPlan.id)}/row/${idx}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            }
          )
          if (res.ok) {
            await load()
          } else {
            btn.disabled = false
          }
        } catch {
          btn.disabled = false
        }
      })
    })
  }

  async function generatePlan() {
    const topBtn = document.getElementById('generate-btn')
    const emptyBtn = document.getElementById('btn-generate-empty')
    ;[topBtn, emptyBtn].forEach((b) => {
      if (b) {
        b.disabled = true
        b.textContent = 'Generating…'
      }
    })
    try {
      await fetch('/api/this-month/generate-now', { method: 'POST' })
      await load()
    } finally {
      if (topBtn) {
        topBtn.disabled = false
        topBtn.textContent = 'Generate plan'
      }
    }
  }

  async function deletePlan() {
    if (!currentPlan?.id) return
    if (!window.confirm('Delete this proposed plan?')) return
    try {
      await fetch(`/api/this-month/plan/${encodeURIComponent(currentPlan.id)}`, {
        method: 'DELETE'
      })
      await load()
    } catch {}
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
  document.getElementById('generate-btn')?.addEventListener('click', generatePlan)

  load()
})()
