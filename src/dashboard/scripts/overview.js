;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
  const fmt1 = (n) => (Number(n) || 0).toFixed(1)
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

  async function loadOverview() {
    try {
      const [overviewRes, healthRes, planRes] = await Promise.allSettled([
        fetch('/api/overview').then((r) => r.json()),
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/this-month').then((r) => r.json())
      ])

      if (overviewRes.status === 'fulfilled' && overviewRes.value?.data) {
        const data = overviewRes.value.data
        renderHero(data)
        renderAllocation(data)
        renderHoldings(data)
        renderTaxCalendar(data)
      }
      if (healthRes.status === 'fulfilled' && healthRes.value?.data) {
        renderHealth(healthRes.value.data)
      }
      if (planRes.status === 'fulfilled') {
        renderThisMonth(planRes.value)
      } else {
        renderThisMonthEmpty()
      }
    } catch (e) {
      console.error('[Overview] load failed:', e)
    }
  }

  function renderHero(data) {
    const nw = data.netWorth || {}
    const total = Number(nw.totalCzk || 0)
    document.getElementById('hero-networth').textContent = fmt0(total) + ' Kč'
    document.getElementById('hero-eur').textContent = '€' + fmt0(nw.totalEur || 0)

    const mom = data.momChange || {}
    const momEl = document.getElementById('hero-mom')
    if (mom.pct == null) {
      momEl.textContent = mom.label || '—'
      momEl.className = 'badge badge-neutral'
    } else {
      const positive = Number(mom.pct) >= 0
      momEl.textContent =
        (positive ? '↑ ' : '↓ ') +
        (positive ? '+' : '') +
        fmt1(mom.pct) +
        '% MoM'
      momEl.className = 'badge ' + (positive ? 'badge-positive' : 'badge-negative')
    }

    document.getElementById('stat-czech-funds').textContent = fmt0(nw.czechFundsCzk) + ' Kč'
    document.getElementById('stat-cz-savings').textContent = fmt0(nw.czechSavingsCzk) + ' Kč'
    document.getElementById('stat-india-nre').textContent =
      fmt0((Number(nw.indiaNRECzk) || 0) + (Number(nw.indiaNROCzk) || 0)) + ' Kč'
    document.getElementById('stat-india-mf').textContent = fmt0(nw.indiaMfCzk) + ' Kč'
  }

  function renderAllocation(data) {
    const a = data.allocation || {}
    const eq = Number(a.equityPct) || 0
    const bd = Number(a.bondsPct) || 0
    const cs = Number(a.cashPct) || 0
    const eqGap = Number(a.equityGap) || 0
    const bdGap = Number(a.bondsGap) || 0
    const csGap = Number(a.cashGap) || 0

    const bar = document.getElementById('alloc-bar-current')
    bar.innerHTML = `
      <div class="alloc-bar-segment alloc-bar-equity" style="width: ${eq}%"></div>
      <div class="alloc-bar-segment alloc-bar-bonds" style="width: ${bd}%"></div>
      <div class="alloc-bar-segment alloc-bar-cash" style="width: ${cs}%"></div>
    `

    document.getElementById('alloc-equity-pct').textContent = fmt1(eq) + '%'
    document.getElementById('alloc-bonds-pct').textContent = fmt1(bd) + '%'
    document.getElementById('alloc-cash-pct').textContent = fmt1(cs) + '%'

    const drift = Math.max(Math.abs(eqGap), Math.abs(bdGap), Math.abs(csGap))
    const driftEl = document.getElementById('alloc-drift-status')
    if (drift > 10) {
      driftEl.textContent = fmt1(drift) + 'pp drift'
      driftEl.className = 'badge badge-warning'
    } else if (drift > 5) {
      driftEl.textContent = fmt1(drift) + 'pp drift'
      driftEl.className = 'badge badge-info'
    } else {
      driftEl.textContent = 'on target'
      driftEl.className = 'badge badge-positive'
    }

    const rows = document.getElementById('alloc-drift-rows')
    const buckets = [
      { name: 'Equity', current: eq, gap: eqGap, color: 'alloc-bar-equity' },
      { name: 'Bonds', current: bd, gap: bdGap, color: 'alloc-bar-bonds' },
      { name: 'Cash', current: cs, gap: csGap, color: 'alloc-bar-cash' }
    ]
    rows.innerHTML = buckets
      .map((b) => {
        const arrow = b.gap > 0.5 ? '↑' : b.gap < -0.5 ? '↓' : '·'
        const direction = b.gap > 0.5 ? 'over' : b.gap < -0.5 ? 'under' : 'on'
        const colorClass = Math.abs(b.gap) > 10 ? 'text-warning' : 'text-secondary'
        return `
          <div class="alloc-drift-row">
            <div class="alloc-drift-row-label">
              <span class="alloc-legend-dot ${b.color}"></span>
              ${escapeHtml(b.name)}
            </div>
            <div class="alloc-drift-row-current">${fmt1(b.current)}%</div>
            <div class="alloc-drift-row-gap ${colorClass}">${arrow} ${fmt1(Math.abs(b.gap))}pp ${direction} target</div>
          </div>
        `
      })
      .join('')
  }

  function renderHoldings(data) {
    const all = (data.holdings || []).slice()
    const top = all
      .slice()
      .sort((a, b) => Number(b.currentValueCzk) - Number(a.currentValueCzk))
      .slice(0, 6)

    const tbody = document.getElementById('holdings-tbody')
    if (top.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: var(--space-6); color: var(--color-text-tertiary);">No holdings yet.</td></tr>`
    } else {
      tbody.innerHTML = top
        .map((h) => {
          const isActive = h.status === 'ACTIVE'
          return `
            <tr>
              <td>
                <div class="fund-name">${escapeHtml(h.name)}</div>
                <div class="fund-isin">${escapeHtml(h.isin)}</div>
              </td>
              <td><span class="badge badge-${isActive ? 'positive' : 'neutral'}">${isActive ? 'Active' : 'Inactive'}</span></td>
              <td class="num">${fmt2(h.units)}</td>
              <td class="num">${fmt4(h.nav)}</td>
              <td class="num"><strong>${fmt0(h.currentValueCzk)} Kč</strong></td>
            </tr>
          `
        })
        .join('')
    }

    document.getElementById('holdings-active-count').textContent = String(
      all.filter((h) => h.status === 'ACTIVE').length
    )
    document.getElementById('holdings-inactive-count').textContent = String(
      all.filter((h) => h.status !== 'ACTIVE').length
    )
  }

  function renderTaxCalendar(data) {
    const list = document.getElementById('tax-calendar-list')
    const items = (data.taxCalendar || [])
      .filter((h) => {
        const days = h.tax?.daysUntilTaxFree
        return typeof days === 'number' && days >= -7 && days <= 90
      })
      .slice(0, 5)

    if (items.length === 0) {
      list.innerHTML = `<div style="font-size: var(--text-sm); color: var(--color-text-tertiary); padding: var(--space-3);">No tax events in the next 90 days.</div>`
      return
    }

    list.innerHTML = items
      .map((h) => {
        const days = Number(h.tax?.daysUntilTaxFree) || 0
        const isFree = h.tax?.isTaxFree
        const dt = h.tax?.taxFreeDate ? new Date(h.tax.taxFreeDate) : null
        const dateStr = dt
          ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : ''
        const cls = isFree ? 'positive' : days < 30 ? 'warning' : 'info'
        return `
          <div class="tax-calendar-item">
            <div>
              <div class="tax-calendar-item-name">${escapeHtml(h.name)}</div>
              <div class="tax-calendar-item-date">${dateStr}</div>
            </div>
            <span class="badge badge-${cls}">${isFree ? 'Tax-free' : days + 'd'}</span>
          </div>
        `
      })
      .join('')
  }

  function renderThisMonth(json) {
    const summary = document.getElementById('this-month-summary')
    const subtitle = document.getElementById('this-month-subtitle')
    const plan = json?.data?.plan || null

    if (!plan || !Array.isArray(plan.allocations)) {
      renderThisMonthEmpty()
      return
    }

    const allocs = plan.allocations || []
    const buys = allocs.filter((a) => a.type === 'BUY')
    const sells = allocs.filter((a) => a.type === 'SELL')
    const buyTotal = buys.reduce((s, a) => s + (Number(a.amountCzk) || 0), 0)
    const sellTotal = sells.reduce((s, a) => s + (Number(a.amountCzk) || 0), 0)

    subtitle.textContent = `${plan.monthYear || ''} · ${allocs.length} rows`

    const reasonText = sells[0]?.reason || buys[0]?.reason || 'No actions this month'

    summary.innerHTML = `
      <div style="display: grid; grid-template-columns: ${sells.length > 0 ? '1fr 1fr' : '1fr'}; gap: var(--space-4); margin-bottom: var(--space-4);">
        ${sells.length > 0
          ? `<div>
              <div style="font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: 4px;">Sell</div>
              <div style="font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-negative-text); font-variant-numeric: tabular-nums; line-height: 1.2;">${fmt0(sellTotal)} Kč</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: 2px;">${sells.length} ${sells.length === 1 ? 'fund' : 'funds'}</div>
            </div>`
          : ''}
        <div>
          <div style="font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: 4px;">Buy</div>
          <div style="font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-positive-text); font-variant-numeric: tabular-nums; line-height: 1.2;">${fmt0(buyTotal)} Kč</div>
          <div style="font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: 2px;">${buys.length} ${buys.length === 1 ? 'fund' : 'funds'}</div>
        </div>
      </div>
      <div style="font-size: var(--text-sm); color: var(--color-text-secondary); line-height: var(--leading-relaxed); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle);">
        ${escapeHtml(reasonText)}
      </div>
    `
  }

  function renderThisMonthEmpty() {
    const sub = document.getElementById('this-month-subtitle')
    if (sub) sub.textContent = 'No plan yet'
    const summary = document.getElementById('this-month-summary')
    if (!summary) return
    summary.innerHTML = `
      <div style="text-align: center; padding: var(--space-5);">
        <div style="font-size: var(--text-sm); color: var(--color-text-tertiary); margin-bottom: var(--space-3);">No plan generated for this month yet.</div>
        <button class="btn btn-primary btn-sm" id="btn-gen-plan" type="button">Generate plan</button>
      </div>
    `
    const btn = document.getElementById('btn-gen-plan')
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.textContent = 'Generating…'
        btn.disabled = true
        try {
          await fetch('/api/this-month/generate-now', { method: 'POST' })
          location.reload()
        } catch {
          btn.textContent = 'Generate plan'
          btn.disabled = false
        }
      })
    }
  }

  function renderHealth(data) {
    const checks = data.checks || []
    const passing = checks.filter((c) => c.status === 'PASS').length

    document.getElementById('health-passing-count').textContent = String(passing)
    document.getElementById('health-total-count').textContent = String(checks.length)
    document.getElementById('health-trust').textContent = (data.trustScore ?? 0) + '%'

    const sidebarTrust = document.getElementById('trust-score')
    if (sidebarTrust && typeof data.trustScore === 'number') {
      sidebarTrust.textContent = data.trustScore + '%'
      sidebarTrust.style.color =
        data.trustScore >= 80
          ? 'var(--color-positive-text)'
          : data.trustScore >= 50
            ? 'var(--color-warning-text)'
            : 'var(--color-negative-text)'
    }

    const grid = document.getElementById('health-checks-grid')
    grid.innerHTML = checks
      .map((c) => {
        const cls = c.status === 'PASS' ? 'pass' : c.status === 'WARN' ? 'warn' : 'fail'
        return `
          <div class="health-check">
            <span class="health-check-dot ${cls}"></span>
            <div class="health-check-text">
              <div class="health-check-name">${escapeHtml((c.name || '').replace(/_/g, ' '))}</div>
              <div class="health-check-msg">${escapeHtml(c.message || '')}</div>
            </div>
          </div>
        `
      })
      .join('')
  }

  loadOverview()

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
})()
