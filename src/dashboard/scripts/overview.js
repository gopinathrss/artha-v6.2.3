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

  function showOverviewError(msg) {
    const el = document.getElementById('overview-error')
    if (!el) return
    el.style.display = 'block'
    el.textContent = msg
  }

  function hideOverviewError() {
    const el = document.getElementById('overview-error')
    if (!el) return
    el.style.display = 'none'
    el.textContent = ''
  }

  const DISPLAY_CCY_STORAGE = 'pie-overview-display-ccy'
  let cachedOverviewData = null
  let cachedRatesPayload = null

  function getDisplayCurrency() {
    try {
      const v = sessionStorage.getItem(DISPLAY_CCY_STORAGE)
      if (v === 'EUR' || v === 'USD' || v === 'INR' || v === 'CZK') return v
    } catch {
      /* */
    }
    return 'CZK'
  }

  function formatNetWorthDisplay(totalCzk, totalEurBackend, rates, ccy) {
    const czk = Number(totalCzk) || 0
    const cpu = (rates && rates.czkPerUnit) || {}
    const eurR = Number(cpu.EUR)
    const eurFromRates = eurR > 0 ? czk / eurR : Number(totalEurBackend) || 0
    const usd = Number(cpu.USD) > 0 ? czk / Number(cpu.USD) : null
    const inr = Number(cpu.INR) > 0 ? czk / Number(cpu.INR) : null

    if (ccy === 'CZK') {
      return {
        primary: fmt0(czk) + ' Kč',
        secondary: '≈ €' + fmt0(Number(totalEurBackend) || eurFromRates)
      }
    }
    if (ccy === 'EUR') {
      return { primary: '€' + fmt0(eurFromRates), secondary: '≈ ' + fmt0(czk) + ' Kč' }
    }
    if (ccy === 'USD') {
      if (usd == null) {
        return {
          primary: fmt0(czk) + ' Kč',
          secondary: 'USD: add CZK/USD rate (refresh FX) to convert here.'
        }
      }
      return { primary: '$' + fmt0(usd), secondary: '≈ ' + fmt0(czk) + ' Kč' }
    }
    if (ccy === 'INR') {
      if (inr == null) {
        return {
          primary: fmt0(czk) + ' Kč',
          secondary: 'INR: add CZK/INR rate (refresh FX) to convert here.'
        }
      }
      return { primary: '₹' + fmt0(inr), secondary: '≈ ' + fmt0(czk) + ' Kč' }
    }
    return {
      primary: fmt0(czk) + ' Kč',
      secondary: '≈ €' + fmt0(Number(totalEurBackend) || eurFromRates)
    }
  }

  async function loadOverview() {
    try {
      hideOverviewError()
      const [overviewRes, ratesRes, healthRes, planRes, alertsRes, strategiesRes] =
        await Promise.allSettled([
          fetch('/api/overview').then((r) => r.json()),
          fetch('/api/currency/rates').then((r) => r.json()),
          fetch('/api/health').then((r) => r.json()),
          fetch('/api/this-month').then((r) => r.json()),
          fetch('/api/alerts?limit=5&urgency=HIGH,CRITICAL').then((r) => r.json()),
          fetch('/api/strategies').then((r) => r.json())
        ])

      let ratesPayload = null
      if (ratesRes.status === 'fulfilled' && ratesRes.value?.success && ratesRes.value?.data) {
        ratesPayload = ratesRes.value.data
      }
      cachedRatesPayload = ratesPayload

      if (overviewRes.status === 'fulfilled') {
        const ov = overviewRes.value
        if (!ov.success) {
          showOverviewError(ov.error || 'Overview request failed')
        } else if (ov.data) {
          cachedOverviewData = ov.data
          renderHero(ov.data, ratesPayload)
          renderAllocation(ov.data)
          renderHoldings(ov.data)
          renderTaxCalendar(ov.data)
        }
      } else {
        showOverviewError('Network error loading overview')
      }
      if (healthRes.status === 'fulfilled' && healthRes.value?.data) {
        renderHealth(healthRes.value.data)
        try {
          window.dispatchEvent(new CustomEvent('pie-health', { detail: healthRes.value.data }))
          window.dispatchEvent(new CustomEvent('artha-health', { detail: healthRes.value.data }))
        } catch {
          /* */
        }
      }
      if (strategiesRes.status === 'fulfilled' && strategiesRes.value?.success && Array.isArray(strategiesRes.value.data)) {
        renderStrategySummary(strategiesRes.value.data)
      } else {
        renderStrategySummary(null)
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value?.success && alertsRes.value?.data?.alerts) {
        renderOverviewAlerts(alertsRes.value.data.alerts)
      }
      if (planRes.status === 'fulfilled') {
        renderThisMonth(planRes.value)
      } else {
        renderThisMonthEmpty()
      }
    } catch (e) {
      console.error('[Overview] load failed:', e)
      showOverviewError(String(e && e.message ? e.message : e))
    }
  }

  function renderOverviewAlerts(alerts) {
    const card = document.getElementById('overview-alerts-card')
    const list = document.getElementById('overview-alerts-list')
    if (!card || !list) return
    if (!alerts || alerts.length === 0) {
      card.style.display = 'none'
      return
    }
    card.style.display = 'block'
    list.innerHTML = alerts
      .map(
        (a) => `
      <div class="tax-calendar-item">
        <a href="/alerts" style="text-decoration:none;color:inherit">
          <div class="tax-calendar-item-title">${escapeHtml(a.urgency || '')}: ${escapeHtml(a.title || '')}</div>
          <div class="tax-calendar-item-meta">${escapeHtml((a.message || '').slice(0, 120))}</div>
        </a>
      </div>`
      )
      .join('')
  }

  function renderHero(data, ratesPayload) {
    const nw = data.netWorth || {}
    const total = Number(nw.totalCzk || 0)
    const ccy = getDisplayCurrency()
    const lines = formatNetWorthDisplay(total, nw.totalEur, ratesPayload, ccy)
    document.getElementById('hero-networth').textContent = lines.primary
    document.getElementById('hero-eur').textContent = lines.secondary

    const sel = document.getElementById('hero-display-ccy')
    if (sel) {
      sel.value = ccy
    }

    const mom = data.momChange || {}
    const momEl = document.getElementById('hero-mom')
    const pctNum = mom.pct != null ? Number(mom.pct) : NaN
    if (!Number.isFinite(pctNum)) {
      momEl.textContent = mom.label || '—'
      momEl.className = 'badge badge-neutral'
      momEl.setAttribute('title', mom.label || '')
    } else {
      const positive = pctNum >= 0
      const pctPart =
        (positive ? '↑ ' : '↓ ') + (positive ? '+' : '') + fmt1(pctNum) + '%'
      const tier = mom.tier
      if (tier === 2 && mom.label) {
        momEl.textContent = pctPart + ' — ' + mom.label
      } else {
        momEl.textContent = pctPart + ' MoM'
      }
      momEl.className = 'badge ' + (positive ? 'badge-positive' : 'badge-negative')
      momEl.setAttribute(
        'title',
        tier === 1
          ? 'Change vs snapshot near 30 days ago (±10 days).'
          : String(mom.label || '')
      )
    }

    const xi = data.xirr || {}
    const xirrEl = document.getElementById('stat-xirr')
    const xirrInfo = document.getElementById('stat-xirr-info')
    if (xirrEl) {
      if (xi.displayState === 'OK' && xi.displayValue != null && Number.isFinite(Number(xi.displayValue))) {
        xirrEl.textContent = fmt2(xi.displayValue) + '%'
      } else {
        xirrEl.textContent = xi.displayLabel || '—'
      }
    }
    if (xirrInfo) {
      const st = xi.displayState
      if (st === 'INSUFFICIENT_HISTORY') {
        xirrInfo.setAttribute(
          'title',
          `We need at least ${Number(xi.minMonthsForDisplay ?? 12)} months of cashflow before showing IRR. You have ${Number(xi.monthsOfHistory ?? 0)} months so far.`
        )
      } else if (st === 'ESTIMATE_HIDDEN') {
        xirrInfo.setAttribute(
          'title',
          'IRR solver could not find a stable rate; short-horizon proxy hidden to avoid misleading values.'
        )
      } else if (st === 'OK') {
        xirrInfo.setAttribute('title', 'Money-weighted IRR (XIRR) over your recorded cashflows.')
      } else {
        xirrInfo.setAttribute('title', '')
      }
    }

    document.getElementById('stat-czech-funds').textContent = fmt0(nw.czechFundsCzk) + ' Kč'
    document.getElementById('stat-cz-savings').textContent = fmt0(nw.czechSavingsCzk) + ' Kč'
    document.getElementById('stat-india-nre').textContent =
      fmt0((Number(nw.indiaNRECzk) || 0) + (Number(nw.indiaNROCzk) || 0)) + ' Kč'
    document.getElementById('stat-india-mf').textContent = fmt0(nw.indiaMfCzk) + ' Kč'
  }

  function renderAllocation(data) {
    const t = data.allocationTargets || {}
    const sub = document.getElementById('alloc-target-subtitle')
    if (sub && t.equityPct != null) {
      sub.textContent = `vs. target ${fmt1(t.equityPct)} / ${fmt1(t.bondsPct)} / ${fmt1(t.cashPct)}`
    }
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

  function renderStrategySummary(strategies) {
    const el = document.getElementById('strategy-summary-slot')
    if (!el) return
    if (!strategies || strategies.length === 0) {
      el.innerHTML = ''
      return
    }
    const approved = strategies.filter((s) => ['APPROVED', 'MONITORING'].includes(s.status)).length
    const proposed = strategies.filter((s) => s.status === 'PROPOSED').length
    const total = strategies.length
    const signals = strategies
      .flatMap((s) => s.signals || [])
      .filter(
        (sig) =>
          ['STRONG_SELL', 'SOFT_SELL'].includes(sig.strength) &&
          (sig.acknowledgedAt == null || sig.acknowledgedAt === '')
      )
    const signalAlert =
      signals.length > 0
        ? `
        <div class="strategy-summary__alert">
          <span>${signals.length} signal(s) need attention</span>
          <a href="/portfolio">Review →</a>
        </div>`
        : ''
    el.innerHTML = `
      <div class="strategy-summary">
        <div class="strategy-summary__header">
          <span class="strategy-summary__title">Strategies</span>
          <a href="/portfolio" class="strategy-summary__link">View all →</a>
        </div>
        <div class="strategy-summary__stats">
          <span>${approved} approved</span>
          <span class="strategy-summary__sep">·</span>
          <span>${proposed} proposed</span>
          <span class="strategy-summary__sep">·</span>
          <span>${total} total</span>
        </div>
        ${signalAlert}
      </div>`
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

  function wireDisplayCurrencyOnce() {
    const sel = document.getElementById('hero-display-ccy')
    if (!sel || sel.dataset.pieWired === '1') return
    sel.dataset.pieWired = '1'
    sel.addEventListener('change', () => {
      try {
        sessionStorage.setItem(DISPLAY_CCY_STORAGE, sel.value)
      } catch {
        /* */
      }
      if (cachedOverviewData) renderHero(cachedOverviewData, cachedRatesPayload)
    })
  }

  wireDisplayCurrencyOnce()
  loadOverview()

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
})()
