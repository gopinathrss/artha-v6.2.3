/**
 * /portfolio — V6.
 *
 * - Hero stats (active/inactive/invested/gain) from /api/holdings + /api/overview.
 * - Full CRUD: add, edit, soft-delete (status=EXITED), hard-delete (?hard=1).
 * - Inline cashflow editor on each holding (SIP / lump / sell / dividend).
 * - Refresh NAVs (Czech AMFI-style refresh) and pull NAV from row drawer.
 *
 * Uses window.PieFetch for HTTP and window.PieUi for drawer/toast/confirm.
 */
;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )
  const fmt2 = (n) => (Number(n) || 0).toFixed(2)
  const fmt4 = (n) => (Number(n) || 0).toFixed(4)

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function statusBadge(status) {
    const s = String(status || '').toUpperCase()
    if (s === 'ACTIVE') return '<span class="badge badge-positive">Active</span>'
    if (s === 'INACTIVE') return '<span class="badge badge-neutral">Inactive</span>'
    if (s === 'EXITED') return '<span class="badge badge-neutral">Exited</span>'
    return '<span class="badge badge-neutral">—</span>'
  }

  function taxFreeDateStr(holding) {
    if (holding.taxFreeDate) {
      return new Date(holding.taxFreeDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    }
    if (holding.purchaseStartDate) {
      const t = new Date(holding.purchaseStartDate)
      t.setFullYear(t.getFullYear() + 3)
      return t.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    }
    return '—'
  }

  function dateInputValue(d) {
    if (!d) return ''
    const dt = new Date(d)
    if (Number.isNaN(dt.getTime())) return ''
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const day = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  let cachedHoldings = []
  /** @type {Record<string, object>} */
  let cachedStrategyByHoldingId = {}

  function strategyCurrentMonth(s) {
    const approvedAt = s.approvedAt || s.createdAt || s.proposedAt
    if (!approvedAt) return 1
    const ms = new Date(approvedAt).getTime()
    if (!Number.isFinite(ms)) return 1
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24 * 30.4)) + 1
  }

  function renderStrategyCard(h, strategy) {
    if (String(h.status || '').toUpperCase() === 'EXITED') return ''

    if (!strategy) {
      return `
        <div class="strategy-card strategy-card--empty">
          <span class="strategy-card__label">No strategy</span>
          <button type="button" class="btn btn-ghost btn-sm" data-strategy-action="propose" data-holding-id="${escapeHtml(h.id)}">
            Propose strategy
          </button>
        </div>`
    }

    const statusClass =
      {
        PROPOSED: 'badge-warning',
        APPROVED: 'badge-positive',
        MONITORING: 'badge-positive',
        REJECTED: 'badge-negative',
        COMPLETED: 'badge-neutral',
        SUPERSEDED: 'badge-neutral'
      }[strategy.status] || 'badge-neutral'

    const curMonth = strategyCurrentMonth(strategy)
    const monthsT = Number(strategy.monthsToTarget) || 0
    const progress = monthsT > 0 ? Math.min(100, Math.round((curMonth / monthsT) * 100)) : 0

    const currentValue = Number(h.currentValueCzk) || 0
    const capCzk = Number(strategy.absoluteCapCzk) || 0
    const capProgress = capCzk > 0 ? Math.min(100, Math.round((currentValue / capCzk) * 100)) : 0

    const sip = Number(strategy.monthlySipCzk) || 0
    const pPct = Number(strategy.profitCapPct) || 0
    const pCzk = Number(strategy.profitCapCzk) || 0
    const dd = Number(strategy.drawdownGuardrailPct) || 0

    const signals = Array.isArray(strategy.signals) ? strategy.signals.slice(0, 3) : []
    const signalsHtml =
      signals.length === 0
        ? ''
        : `
      <div class="strategy-card__signals">
        <span class="strategy-card__signals-label">Recent signals</span>
        ${signals
          .map((sig) => {
            const st = String(sig.strength || '')
              .toLowerCase()
              .replace(/_/g, '-')
            return `
            <div class="signal-row signal-row--${escapeHtml(st)}">
              <span class="signal-row__type">${escapeHtml(sig.signalType || '')}</span>
              <span class="signal-row__strength">${escapeHtml(sig.strength || '')}</span>
              <span class="signal-row__reason">${escapeHtml((sig.reasoning || '').slice(0, 220))}</span>
            </div>`
          })
          .join('')}
      </div>`

    const proposedActions =
      strategy.status === 'PROPOSED'
        ? `
        <button type="button" class="btn btn-primary btn-sm" data-strategy-action="approve" data-strategy-id="${escapeHtml(strategy.id)}">Approve</button>
        <button type="button" class="btn btn-ghost btn-sm" data-strategy-action="reject" data-strategy-id="${escapeHtml(strategy.id)}">Reject</button>
        <button type="button" class="btn btn-ghost btn-sm" data-strategy-action="propose" data-holding-id="${escapeHtml(h.id)}">Re-propose</button>`
        : ''
    const approvedActions =
      strategy.status === 'APPROVED' || strategy.status === 'MONITORING'
        ? `
        <button type="button" class="btn btn-ghost btn-sm" data-strategy-action="propose" data-holding-id="${escapeHtml(h.id)}">New proposal</button>`
        : ''
    const rejectedActions =
      strategy.status === 'REJECTED'
        ? `
        <button type="button" class="btn btn-ghost btn-sm" data-strategy-action="propose" data-holding-id="${escapeHtml(h.id)}">Propose strategy</button>`
        : ''

    const reasoningHtml = renderReasoningCollapsed(String(strategy.proposalReasoning || ''))

    return `
      <div class="strategy-card" data-holding-id="${escapeHtml(h.id)}" data-strategy-id="${escapeHtml(strategy.id)}">
        <div class="strategy-card__header">
          <span class="strategy-card__title">Strategy</span>
          <span class="badge ${statusClass}">${escapeHtml(strategy.status || '')}</span>
          <span class="badge badge-neutral">${escapeHtml(strategy.confidence || '')}</span>
        </div>
        <div class="strategy-card__metrics">
          <div class="strategy-metric">
            <span class="strategy-metric__label">Monthly SIP</span>
            <span class="strategy-metric__value">${fmt0(sip)} Kč</span>
          </div>
          <div class="strategy-metric">
            <span class="strategy-metric__label">Target cap</span>
            <span class="strategy-metric__value">${fmt0(capCzk)} Kč</span>
          </div>
          <div class="strategy-metric">
            <span class="strategy-metric__label">Profit cap</span>
            <span class="strategy-metric__value">+${pPct.toFixed(0)}% / ${fmt0(pCzk)} Kč</span>
          </div>
          <div class="strategy-metric">
            <span class="strategy-metric__label">Drawdown guard</span>
            <span class="strategy-metric__value">-${dd.toFixed(0)}%</span>
          </div>
        </div>
        <div class="strategy-card__progress">
          <div class="progress-row">
            <span>Time: month ${curMonth} of ${monthsT}</span>
            <span>${progress}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${progress}%"></div>
          </div>
        </div>
        <div class="strategy-card__progress">
          <div class="progress-row">
            <span>Position: ${fmt0(currentValue)} Kč / ${fmt0(capCzk)} Kč</span>
            <span>${capProgress}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill ${capProgress >= 90 ? 'progress-bar__fill--warning' : ''}" style="width:${capProgress}%"></div>
          </div>
        </div>
        <div class="strategy-card__reasoning">${reasoningHtml}</div>
        <div class="strategy-card__actions">${proposedActions}${approvedActions}${rejectedActions}</div>
        ${signalsHtml}
      </div>`
  }

  function renderReasoningCollapsed(text, maxLen = 120) {
    const t = String(text || '')
    if (!t) return '<p class="strategy-card__reasoning-text">—</p>'
    if (t.length <= maxLen) return `<p class="strategy-card__reasoning-text">${escapeHtml(t)}</p>`
    const short = t.slice(0, maxLen).trim()
    return (
      '<div data-reasoning-wrapper>' +
      '<p class="reasoning-preview">' +
      escapeHtml(short) +
      '… ' +
      '<button class="btn-link reasoning-toggle" type="button" onclick="toggleReasoning(this)">' +
      'Show more ▼' +
      '</button>' +
      '</p>' +
      '<div class="reasoning-full" style="display:none">' +
      `<p class="strategy-card__reasoning-text">${escapeHtml(t)}</p>` +
      '</div>' +
      '</div>'
    )
  }

  // Exposed for inline onclick toggles (no framework).
  window.toggleReasoning = function toggleReasoning(btn) {
    try {
      const wrapper = btn && btn.closest ? btn.closest('[data-reasoning-wrapper]') : null
      if (!wrapper) return
      const preview = wrapper.querySelector('.reasoning-preview')
      const full = wrapper.querySelector('.reasoning-full')
      if (!preview || !full) return

      const isExpanded = full.style.display !== 'none' && full.style.display !== ''
      if (isExpanded) {
        full.style.display = 'none'
        preview.style.display = ''
        btn.textContent = 'Show more ▼'
      } else {
        preview.style.display = 'none'
        full.style.display = 'block'
        btn.textContent = 'Show less ▲'
      }
    } catch {
      /* */
    }
  }

  function wirePortfolioStrategyTable() {
    const table = document.getElementById('holdings-table')
    if (!table || table.dataset.strategyWire === '1') return
    table.dataset.strategyWire = '1'
    table.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-strategy-action]')
      if (!btn) return
      const act = btn.getAttribute('data-strategy-action')
      const oldLabel = btn.textContent
      try {
        if (act === 'propose') {
          const hid = btn.getAttribute('data-holding-id')
          if (!hid) return
          btn.disabled = true
          btn.textContent = 'Proposing…'
          const data = await PieFetch.post('/api/strategies/propose/' + encodeURIComponent(hid), {})
          if (data.success) {
            PieUi.toast('Strategy proposed — review and approve below', 'success')
            await load()
          } else {
            PieUi.toast('Failed: ' + (data.error || 'unknown'), 'error')
            btn.disabled = false
            btn.textContent = oldLabel
          }
        } else if (act === 'approve') {
          const sid = btn.getAttribute('data-strategy-id')
          if (!sid) return
          btn.disabled = true
          const data = await PieFetch.patch('/api/strategies/' + encodeURIComponent(sid) + '/approve', {
            note: ''
          })
          if (data.success) {
            PieUi.toast('Strategy approved — PIE will now monitor this position', 'success')
            await load()
          } else {
            PieUi.toast('Failed: ' + (data.error || 'unknown'), 'error')
            btn.disabled = false
          }
        } else if (act === 'reject') {
          const sid = btn.getAttribute('data-strategy-id')
          if (!sid) return
          btn.disabled = true
          const data = await PieFetch.patch('/api/strategies/' + encodeURIComponent(sid) + '/reject', {})
          if (data.success) {
            PieUi.toast('Strategy rejected', 'success')
            await load()
          } else {
            PieUi.toast('Failed: ' + (data.error || 'unknown'), 'error')
            btn.disabled = false
          }
        }
      } catch (err) {
        PieUi.toast(String(err.message || err), 'error')
        btn.disabled = false
        btn.textContent = oldLabel
      }
    })
  }

  async function load() {
    const ph = window.PiePageHealth
    try {
      const [h, o, stratRes] = await Promise.all([
        PieFetch.get('/api/holdings'),
        PieFetch.get('/api/overview').catch(() => ({ data: {} })),
        PieFetch.get('/api/strategies').catch(() => ({ success: false, data: [] }))
      ])
      cachedHoldings = h?.data?.holdings || []
      cachedStrategyByHoldingId = {}
      if (stratRes && stratRes.success && Array.isArray(stratRes.data)) {
        for (const s of stratRes.data) {
          if (s.holdingId) cachedStrategyByHoldingId[s.holdingId] = s
        }
      }
      renderHero(cachedHoldings, o?.data || {})
      renderTable(cachedHoldings)
      if (ph) {
        const nowIso = new Date().toISOString()
        let newestMs = null
        let anyVeryStale = false
        for (const row of cachedHoldings || []) {
          const t = row && (row.navLastFetchedAt || row.updatedAt || row.createdAt)
          if (!t) continue
          const ms = new Date(t).getTime()
          if (!Number.isFinite(ms)) continue
          if (newestMs == null || ms > newestMs) newestMs = ms
          const ageDays = (Date.now() - ms) / 86400000
          if (ageDays > 7) anyVeryStale = true
        }
        const last = newestMs != null ? new Date(newestMs).toISOString() : nowIso
        ph.updatePageHealthDot('portfolio', last, false, anyVeryStale ? 'Some NAVs are older than 7 days' : 'Portfolio loaded')
      }
    } catch (e) {
      document.getElementById('holdings-tbody').innerHTML =
        '<tr><td colspan="9" class="empty-state"><div class="empty-state-message">' +
        escapeHtml('Could not load holdings: ' + (e.message || e)) +
        '</div></td></tr>'
      if (ph) ph.updatePageHealthDot('portfolio', null, true, 'Failed to load holdings')
    }
  }

  function renderHero(holdings, overview) {
    const nw = overview?.netWorth || {}
    const fromOverview = Number(nw.czechFundsCzk)
    const fundsBookCzk =
      Number.isFinite(fromOverview) && fromOverview >= 0
        ? fromOverview
        : holdings
            .filter((h) => String(h.status).toUpperCase() !== 'EXITED')
            .reduce((s, h) => s + (Number(h.currentValueCzk) || 0), 0)

    const totalAllCzk = Number(nw.totalCzk)
    const active = holdings.filter((h) => String(h.status).toUpperCase() === 'ACTIVE').length
    const inactive = holdings.length - active
    const invested = Number(overview?.totalInvested) || 0
    let gainCzk = Number(nw.inflowWeightedGainCzk)
    let gainPct = Number(nw.inflowWeightedGainPct)
    if (!Number.isFinite(gainCzk) || !Number.isFinite(gainPct)) {
      gainCzk = fundsBookCzk - invested
      gainPct = invested > 0 ? (gainCzk / invested) * 100 : 0
    }

    document.getElementById('hero-total').textContent = fmt0(fundsBookCzk) + ' Kč'
    let sub =
      holdings.length + ' ' + (holdings.length === 1 ? 'holding' : 'holdings') + ' tracked'
    if (Number.isFinite(totalAllCzk) && totalAllCzk > 0 && Math.abs(totalAllCzk - fundsBookCzk) > 2) {
      sub += ' · All assets (full net worth) ' + fmt0(totalAllCzk) + ' Kč'
    }
    document.getElementById('hero-sub').textContent = sub
    document.getElementById('stat-active').textContent = String(active)
    document.getElementById('stat-inactive').textContent = String(inactive)
    document.getElementById('stat-invested').textContent =
      invested > 0 ? fmt0(invested) + ' Kč' : '—'

    const hintEl = document.getElementById('hero-invested-hint')
    if (hintEl) {
      if (invested > fundsBookCzk * 1.35 && fundsBookCzk > 2000) {
        hintEl.style.display = 'block'
        hintEl.textContent =
          'Lifetime contributed is much larger than today’s fund value. That usually means many months of ' +
          '“Fund Invested” cells summed in your sheet, or the Banking import was applied more than once. ' +
          'To reset import rows: run `node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/clear-banking-import-cashflows.ts` ' +
          'then re-import your workbook (or open each holding → Cashflows and edit).'
      } else {
        hintEl.style.display = 'none'
        hintEl.textContent = ''
      }
    }

    const gainEl = document.getElementById('stat-gain')
    if (Number.isFinite(gainCzk) && Number.isFinite(gainPct)) {
      const positive = gainCzk >= 0
      gainEl.textContent =
        (positive ? '+' : '') + fmt0(gainCzk) + ' Kč (' + fmt2(gainPct) + '% vs contributed)'
      gainEl.style.color = positive
        ? 'var(--color-positive-text)'
        : 'var(--color-negative-text)'
    } else {
      gainEl.textContent = '—'
    }

    document.getElementById('holdings-subtitle').textContent =
      active + ' active · ' + inactive + ' inactive'
  }

  function renderTable(holdings) {
    const tbody = document.getElementById('holdings-tbody')
    if (!holdings || holdings.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">
            <div class="empty-state-cta">
              <div class="empty-state-message">
                No holdings yet. Add your first one to start tracking your portfolio.
              </div>
              <button class="btn btn-primary btn-sm" type="button" id="empty-add-btn">
                + Add holding
              </button>
            </div>
          </td>
        </tr>`
      const a = document.getElementById('empty-add-btn')
      if (a) a.addEventListener('click', () => openHoldingDrawer(null))
      return
    }
    const sorted = holdings
      .slice()
      .sort((a, b) => (Number(b.currentValueCzk) || 0) - (Number(a.currentValueCzk) || 0))

    tbody.innerHTML = sorted
      .map((h) => {
        const st = cachedStrategyByHoldingId[h.id]
        const stratCell = renderStrategyCard(h, st)
        const stratRow = stratCell
          ? `<tr class="holding-strategy-row"><td colspan="9">${stratCell}</td></tr>`
          : ''
        return `
        <tr data-holding-id="${escapeHtml(h.id)}">
          <td>
            <div class="fund-name">${escapeHtml(h.name || '—')}</div>
            <div class="fund-isin">${escapeHtml(h.isin || '')}</div>
          </td>
          <td>${statusBadge(h.status)}</td>
          <td><span class="text-secondary">${escapeHtml(h.category || '—')}</span></td>
          <td class="num">${fmt2(h.units)}</td>
          <td class="num">${fmt4(h.nav)}</td>
          <td class="num"><strong>${fmt0(h.currentValueCzk)} Kč</strong></td>
          <td class="num">${Number(h.monthlySipCzk) > 0 ? fmt0(h.monthlySipCzk) + ' Kč' : '—'}</td>
          <td><span class="text-secondary">${escapeHtml(taxFreeDateStr(h))}</span></td>
          <td class="num">
            <button class="btn btn-ghost btn-sm" data-act="edit" type="button">Edit</button>
          </td>
        </tr>${stratRow}`
      })
      .join('')

    Array.from(tbody.querySelectorAll('button[data-act="edit"]')).forEach((b) => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('tr').getAttribute('data-holding-id')
        const h = cachedHoldings.find((x) => x.id === id)
        if (h) openHoldingDrawer(h)
      })
    })
  }

  function fieldHtml(label, name, value, type, attrs) {
    const a = attrs || ''
    return (
      '<div class="pie-form-field"><label for="f_' +
      name +
      '">' +
      escapeHtml(label) +
      '</label><input id="f_' +
      name +
      '" name="' +
      name +
      '" type="' +
      (type || 'text') +
      '" value="' +
      escapeHtml(value == null ? '' : String(value)) +
      '" ' +
      a +
      ' /></div>'
    )
  }

  function selectHtml(label, name, value, options) {
    return (
      '<div class="pie-form-field"><label for="f_' +
      name +
      '">' +
      escapeHtml(label) +
      '</label><select id="f_' +
      name +
      '" name="' +
      name +
      '">' +
      options
        .map(
          (o) =>
            '<option value="' +
            escapeHtml(o.value) +
            '"' +
            (String(o.value) === String(value) ? ' selected' : '') +
            '>' +
            escapeHtml(o.label) +
            '</option>'
        )
        .join('') +
      '</select></div>'
    )
  }

  function openHoldingDrawer(h) {
    const isNew = !h
    const formHtml = `
      <form class="pie-form" id="holding-form" autocomplete="off">
        ${fieldHtml('Fund name', 'name', h?.name, 'text', 'required')}
        ${fieldHtml('ISIN', 'isin', h?.isin)}
        <div class="pie-form-row">
          ${selectHtml('Category', 'category', h?.category || 'EQUITY', [
            { value: 'EQUITY', label: 'Equity' },
            { value: 'BONDS', label: 'Bonds' },
            { value: 'CASH', label: 'Cash / money market' },
            { value: 'COMMODITY', label: 'Commodity' },
            { value: 'MIXED', label: 'Mixed / multi-asset' },
            { value: 'OTHER', label: 'Other' }
          ])}
          ${selectHtml('Status', 'status', h?.status || 'ACTIVE', [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' },
            { value: 'EXITED', label: 'Exited' }
          ])}
        </div>
        <div class="pie-form-row">
          ${fieldHtml('Units', 'units', h?.units != null ? h.units : '', 'number', 'step="0.0001"')}
          ${fieldHtml('NAV (Kč)', 'nav', h?.nav != null ? h.nav : '', 'number', 'step="0.0001"')}
        </div>
        <div class="pie-form-row">
          ${fieldHtml('Monthly SIP (Kč)', 'monthlySipCzk', h?.monthlySipCzk != null ? h.monthlySipCzk : '', 'number', 'step="1"')}
          ${fieldHtml('Purchase start', 'purchaseStartDate', dateInputValue(h?.purchaseStartDate), 'date')}
        </div>
        <p class="pie-form-help">
          Tax-free date is computed automatically as 3 years after the purchase start date (CZ funds rule).
        </p>
      </form>
      ${isNew ? '' : '<hr style="margin: var(--space-4) 0; border: 0; border-top: 1px solid var(--color-border-subtle)" /><div id="cashflow-list"><div class="pie-form-help">Loading cashflows…</div></div>'}
    `

    const dr = PieUi.drawer({
      title: isNew ? 'Add holding' : 'Edit holding',
      bodyHtml: formHtml
    })

    dr.setFooter([
      isNew
        ? null
        : PieUi.btn(
            'Delete…',
            async () => {
              const ok = await PieUi.confirm({
                title: 'Delete holding?',
                message:
                  'This marks the holding as EXITED. It stays for history. Use shift+click to remove permanently.',
                tone: 'danger',
                confirmLabel: 'Mark exited'
              })
              if (!ok) return
              try {
                await PieFetch.delete('/api/holdings/' + encodeURIComponent(h.id))
                PieUi.toast('Holding marked exited', 'success')
                dr.close()
                await load()
              } catch (e) {
                PieUi.toast('Delete failed: ' + (e.message || e), 'error')
              }
            },
            'ghost'
          ),
      PieUi.btn('Cancel', () => dr.close(), 'ghost'),
      PieUi.btn(
        isNew ? 'Create' : 'Save',
        async () => {
          const f = document.getElementById('holding-form')
          if (!f.reportValidity()) return
          const fd = new FormData(f)
          const body = {}
          fd.forEach((v, k) => {
            if (v === '' || v == null) return
            if (['units', 'nav', 'monthlySipCzk'].includes(k)) body[k] = Number(v)
            else body[k] = v
          })
          try {
            if (isNew) {
              await PieFetch.post('/api/holdings', body)
              PieUi.toast('Holding created', 'success')
            } else {
              await PieFetch.put('/api/holdings/' + encodeURIComponent(h.id), body)
              PieUi.toast('Holding saved', 'success')
            }
            dr.close()
            await load()
          } catch (e) {
            PieUi.toast('Save failed: ' + (e.message || e), 'error')
          }
        },
        'primary'
      )
    ])

    if (!isNew) renderCashflowsInto(h)
  }

  async function renderCashflowsInto(h) {
    const root = document.getElementById('cashflow-list')
    if (!root) return
    try {
      const r = await PieFetch.get('/api/cashflows?holdingId=' + encodeURIComponent(h.id))
      const cf = r?.data?.cashflows || []
      root.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">
          <div style="font-weight: var(--weight-semibold); font-size: var(--text-sm)">Cashflows</div>
          <button class="btn btn-ghost btn-sm" id="add-cf-btn" type="button">+ Add cashflow</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Date</th><th>Type</th><th class="num">Amount (Kč)</th><th></th></tr></thead>
            <tbody id="cf-tbody">
              ${
                cf.length === 0
                  ? '<tr><td colspan="4" class="empty-state"><div class="empty-state-message">No cashflows yet.</div></td></tr>'
                  : cf
                      .map(
                        (x) => `
                <tr data-cf-id="${escapeHtml(x.id)}">
                  <td>${escapeHtml(new Date(x.date).toLocaleDateString('en-GB'))}</td>
                  <td><span class="pie-chip">${escapeHtml(x.type)}</span></td>
                  <td class="num">${fmt0(x.amountCzk)}</td>
                  <td class="num"><button class="btn btn-ghost btn-sm" data-cf-act="del" type="button">Delete</button></td>
                </tr>`
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>`
      const addBtn = document.getElementById('add-cf-btn')
      if (addBtn) addBtn.addEventListener('click', () => openCashflowDrawer(h))
      Array.from(document.querySelectorAll('button[data-cf-act="del"]')).forEach((b) => {
        b.addEventListener('click', async (e) => {
          const id = e.currentTarget.closest('tr').getAttribute('data-cf-id')
          const ok = await PieUi.confirm({
            title: 'Delete cashflow?',
            message: 'This will affect XIRR and gain calculations.',
            tone: 'danger',
            confirmLabel: 'Delete'
          })
          if (!ok) return
          try {
            await PieFetch.delete('/api/cashflows/' + encodeURIComponent(id))
            PieUi.toast('Cashflow deleted', 'success')
            await renderCashflowsInto(h)
          } catch (err) {
            PieUi.toast('Delete failed: ' + (err.message || err), 'error')
          }
        })
      })
    } catch (e) {
      root.innerHTML =
        '<div class="pie-form-help">Could not load cashflows: ' + escapeHtml(e.message || e) + '</div>'
    }
  }

  function openCashflowDrawer(h) {
    const today = new Date().toISOString().slice(0, 10)
    const html = `
      <form class="pie-form" id="cf-form">
        ${fieldHtml('Date', 'date', today, 'date', 'required')}
        ${selectHtml('Type', 'type', 'SIP', [
          { value: 'SIP', label: 'SIP (recurring contribution)' },
          { value: 'LUMP_SUM', label: 'Lump sum (one-off buy)' },
          { value: 'WITHDRAWAL', label: 'Withdrawal / sell' },
          { value: 'DIVIDEND', label: 'Dividend / payout' }
        ])}
        ${fieldHtml('Amount (Kč)', 'amountCzk', '', 'number', 'step="1" required')}
        ${fieldHtml('Notes', 'notes', '', 'text')}
        <p class="pie-form-help">
          Use the <strong>absolute</strong> amount in Kč. Buys: type SIP or lump sum (stored amount can be
          positive or negative). Sells: type withdrawal — we subtract its magnitude from «Total invested» either way.
        </p>
      </form>`
    const dr = PieUi.drawer({ title: 'Add cashflow — ' + h.name, bodyHtml: html })
    dr.setFooter([
      PieUi.btn('Cancel', () => dr.close(), 'ghost'),
      PieUi.btn(
        'Save',
        async () => {
          const f = document.getElementById('cf-form')
          if (!f.reportValidity()) return
          const fd = new FormData(f)
          const body = { holdingId: h.id }
          fd.forEach((v, k) => {
            if (v === '' || v == null) return
            body[k] = k === 'amountCzk' ? Number(v) : v
          })
          try {
            await PieFetch.post('/api/cashflows', body)
            PieUi.toast('Cashflow added', 'success')
            dr.close()
            await renderCashflowsInto(h)
          } catch (e) {
            PieUi.toast('Save failed: ' + (e.message || e), 'error')
          }
        },
        'primary'
      )
    ])
  }

  // ===== top bar wiring =====
  document.getElementById('add-holding-btn')?.addEventListener('click', () => openHoldingDrawer(null))
  document.getElementById('refresh-btn')?.addEventListener('click', () => load())
  document.getElementById('strategy-eval-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('strategy-eval-btn')
    if (!btn) return
    const old = btn.textContent
    btn.disabled = true
    btn.textContent = 'Evaluating…'
    try {
      const data = await PieFetch.post('/api/strategies/evaluate-all', {})
      if (!data.success) {
        PieUi.toast('Evaluation failed: ' + (data.error || 'unknown'), 'error')
        return
      }
      const rows = data.data || []
      const fired = rows.filter((r) => r.decision && r.decision.shouldNotify).length
      PieUi.toast(
        'Evaluation complete. ' +
          rows.length +
          ' strategies checked. ' +
          (fired > 0 ? fired + ' signal(s) fired.' : 'No notify signals.'),
        'success'
      )
      await load()
    } catch (e) {
      PieUi.toast(String(e.message || e), 'error')
    } finally {
      btn.disabled = false
      btn.textContent = old
    }
  })
  document.getElementById('refresh-nav-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-nav-btn')
    const old = btn.textContent
    btn.disabled = true
    btn.textContent = 'Refreshing…'
    try {
      await PieFetch.post('/api/holdings/refresh-nav', {})
      PieUi.toast('NAVs refreshed', 'success')
      await load()
    } catch (e) {
      PieUi.toast('NAV refresh failed: ' + (e.message || e), 'error')
    } finally {
      btn.disabled = false
      btn.textContent = old
    }
  })

  wirePortfolioStrategyTable()
  load()
})()
