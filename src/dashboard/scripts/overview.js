;(function () {
  const fmtCzk = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))

  const fmtPct = (n) => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%'

  async function loadOverview() {
    try {
      const res = await fetch('/api/overview')
      const json = await res.json()
      if (!json.success || !json.data) return
      const data = json.data
      if (json.demo && document.getElementById('demoBanner')) {
        document.getElementById('demoBanner').style.display = 'block'
      }
      renderHero(data)
      renderAllocation(data)
      renderHoldings(data)
      renderTaxCalendar(data)
      renderThisMonth()
    } catch (e) {
      console.error('Overview load failed:', e)
    }
  }

  async function loadHealth() {
    try {
      const res = await fetch('/api/health')
      const json = await res.json()
      if (!json.success || !json.data) return
      renderHealth(json.data)
    } catch (e) {
      console.error('Health load failed:', e)
    }
  }

  function renderHero(data) {
    const nw = data.netWorth
    const hero = document.getElementById('hero-networth')
    if (hero) hero.textContent = fmtCzk(nw.totalCzk) + ' CZK'
    const eur = document.getElementById('hero-eur')
    if (eur) eur.textContent = '€' + fmtCzk(nw.totalEur)

    const mom = data.momChange
    const momEl = document.getElementById('hero-mom')
    if (momEl) {
      if (mom?.pct == null) {
        momEl.textContent = mom?.label ?? '—'
        momEl.className = 'badge badge-neutral'
      } else {
        const positive = mom.pct >= 0
        momEl.textContent = (positive ? '↑ ' : '↓ ') + fmtPct(mom.pct) + ' MoM'
        momEl.className = 'badge ' + (positive ? 'badge-positive' : 'badge-negative')
      }
    }

    const czech = document.getElementById('stat-czech-funds')
    if (czech) czech.textContent = fmtCzk(nw.czechFundsCzk)
    const sav = document.getElementById('stat-cz-savings')
    if (sav) sav.textContent = fmtCzk(nw.czechSavingsCzk)
    const nre = document.getElementById('stat-india-nre')
    if (nre) nre.textContent = fmtCzk((nw.indiaNRECzk ?? 0) + (nw.indiaNROCzk ?? 0))
    const mf = document.getElementById('stat-india-mf')
    if (mf) mf.textContent = fmtCzk(nw.indiaMfCzk ?? 0)
  }

  function renderAllocation(data) {
    const a = data.allocation
    const bar = document.getElementById('alloc-bar-current')
    if (!bar) return
    bar.innerHTML =
      '<div class="alloc-bar-segment alloc-bar-equity" style="width:' +
      a.equityPct +
      '%"></div>' +
      '<div class="alloc-bar-segment alloc-bar-bonds" style="width:' +
      a.bondsPct +
      '%"></div>' +
      '<div class="alloc-bar-segment alloc-bar-cash" style="width:' +
      a.cashPct +
      '%"></div>'
    const eq = document.getElementById('alloc-equity-pct')
    const bd = document.getElementById('alloc-bonds-pct')
    const ca = document.getElementById('alloc-cash-pct')
    if (eq) eq.textContent = Number(a.equityPct).toFixed(1) + '%'
    if (bd) bd.textContent = Number(a.bondsPct).toFixed(1) + '%'
    if (ca) ca.textContent = Number(a.cashPct).toFixed(1) + '%'

    const drift = Math.max(Math.abs(a.equityGap), Math.abs(a.bondsGap), Math.abs(a.cashGap))
    const driftEl = document.getElementById('alloc-drift-status')
    if (driftEl) {
      if (drift > 10) {
        driftEl.textContent = drift.toFixed(0) + 'pp drift'
        driftEl.className = 'badge badge-warning'
      } else {
        driftEl.textContent = 'on target'
        driftEl.className = 'badge badge-positive'
      }
    }

    const rows = document.getElementById('alloc-drift-rows')
    if (!rows) return
    rows.innerHTML = ''
    const buckets = [
      { name: 'Equity', current: a.equityPct, gap: a.equityGap, color: 'alloc-bar-equity' },
      { name: 'Bonds', current: a.bondsPct, gap: a.bondsGap, color: 'alloc-bar-bonds' },
      { name: 'Cash', current: a.cashPct, gap: a.cashGap, color: 'alloc-bar-cash' }
    ]
    for (const b of buckets) {
      const direction = b.gap > 0 ? 'over' : b.gap < 0 ? 'under' : 'at'
      const arrow = b.gap > 0 ? '↑' : b.gap < 0 ? '↓' : '·'
      const gapCls = Math.abs(b.gap) > 5 ? 'text-warning' : 'text-secondary'
      rows.innerHTML +=
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--text-sm);gap:var(--space-2);flex-wrap:wrap">' +
        '<span><span class="alloc-legend-dot ' +
        b.color +
        '" style="vertical-align:middle"></span> ' +
        b.name +
        '</span>' +
        '<span class="num text-secondary">' +
        Number(b.current).toFixed(1) +
        '%</span>' +
        '<span class="num ' +
        gapCls +
        '" style="min-width:100px;text-align:right">' +
        arrow +
        ' ' +
        Math.abs(Number(b.gap)).toFixed(1) +
        'pp ' +
        direction +
        ' target</span></div>'
    }
  }

  function renderHoldings(data) {
    const tbody = document.getElementById('holdings-tbody')
    if (!tbody) return
    const holdings = (data.holdings ?? [])
      .slice()
      .sort((a, b) => Number(b.currentValueCzk) - Number(a.currentValueCzk))
      .slice(0, 6)
    tbody.innerHTML = holdings
      .map(
        (h) =>
          '<tr>' +
          '<td data-label="Fund"><div style="font-weight:var(--weight-semibold);word-break:break-word">' +
          escapeHtml(h.name) +
          '</div>' +
          '<div style="font-size:var(--text-xs);color:var(--color-text-tertiary)">' +
          escapeHtml(h.isin) +
          '</div></td>' +
          '<td data-label="Status"><span class="badge ' +
          (h.status === 'ACTIVE' ? 'badge-positive' : 'badge-neutral') +
          '">' +
          (h.status === 'ACTIVE' ? 'Active' : h.status === 'INACTIVE' ? 'Inactive' : escapeHtml(String(h.status))) +
          '</span></td>' +
          '<td class="num" data-label="Units">' +
          Number(h.units).toFixed(2) +
          '</td>' +
          '<td class="num" data-label="NAV">' +
          Number(h.nav).toFixed(4) +
          '</td>' +
          '<td class="num" data-label="Value"><strong>' +
          fmtCzk(h.currentValueCzk) +
          '</strong></td></tr>'
      )
      .join('')

    const all = data.holdings ?? []
    const act = document.getElementById('holdings-active-count')
    const ina = document.getElementById('holdings-inactive-count')
    if (act) act.textContent = String(all.filter((h) => h.status === 'ACTIVE').length)
    if (ina) ina.textContent = String(all.filter((h) => h.status === 'INACTIVE').length)
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderTaxCalendar(data) {
    const list = document.getElementById('tax-calendar-list')
    if (!list) return
    const next90 = (data.taxCalendar ?? [])
      .filter((h) => {
        const days = h.tax?.daysUntilTaxFree ?? Infinity
        return days >= -7 && days <= 90
      })
      .slice(0, 5)
    if (next90.length === 0) {
      list.innerHTML =
        '<div style="font-size:var(--text-sm);color:var(--color-text-tertiary);padding:var(--space-3)">No tax events in the next 90 days.</div>'
      return
    }
    list.innerHTML = next90
      .map((h, i) => {
        const days = h.tax?.daysUntilTaxFree ?? 0
        const isFree = h.tax?.isTaxFree
        const date = h.tax?.taxFreeDate
          ? new Date(h.tax.taxFreeDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : ''
        const border =
          i < next90.length - 1 ? 'border-bottom:1px solid var(--color-border-subtle)' : ''
        return (
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;' +
          border +
          '">' +
          '<div><div style="font-size:var(--text-sm);font-weight:var(--weight-semibold)">' +
          escapeHtml(h.name) +
          '</div>' +
          '<div style="font-size:var(--text-xs);color:var(--color-text-tertiary)">' +
          escapeHtml(date) +
          '</div></div>' +
          '<span class="badge ' +
          (isFree ? 'badge-positive' : 'badge-warning') +
          '">' +
          (isFree ? 'Tax-free' : escapeHtml(String(days)) + 'd') +
          '</span></div>'
        )
      })
      .join('')
  }

  function renderThisMonth() {
    const summary = document.getElementById('this-month-summary')
    const sub = document.getElementById('this-month-subtitle')
    if (!summary) return
    fetch('/api/this-month')
      .then((r) => r.json())
      .then((json) => {
        const plan = json?.data?.plan
        if (!plan) {
          summary.innerHTML =
            '<div style="text-align:center;padding:var(--space-5)">' +
            '<div style="font-size:var(--text-sm);color:var(--color-text-tertiary);margin-bottom:var(--space-3)">No plan generated for this month yet.</div>' +
            '<button type="button" class="btn btn-primary btn-sm" id="btn-gen-plan">Generate plan</button></div>'
          if (sub) sub.textContent = '—'
          const btn = document.getElementById('btn-gen-plan')
          if (btn) {
            btn.addEventListener('click', () => {
              fetch('/api/this-month/generate-now', { method: 'POST' })
                .then(() => location.reload())
                .catch(() => {})
            })
          }
          return
        }
        const allocs = plan.allocations ?? []
        const buys = allocs.filter((a) => a.type === 'BUY')
        const sells = allocs.filter((a) => a.type === 'SELL')
        const buyTotal = buys.reduce((s, a) => s + Number(a.amountCzk), 0)
        const sellTotal = sells.reduce((s, a) => s + Number(a.amountCzk), 0)
        if (sub) sub.textContent = plan.monthYear + ' · ' + allocs.length + ' rows'
        summary.innerHTML =
          '<div style="display:flex;gap:var(--space-4);margin-bottom:var(--space-3);flex-wrap:wrap">' +
          (sells.length > 0
            ? '<div class="stat-block" style="flex:1;min-width:120px"><div class="stat-block-label">Sell</div><div class="stat-block-value" style="font-size:var(--text-lg);color:var(--color-negative-text)">' +
              fmtCzk(sellTotal) +
              '</div><div style="font-size:var(--text-xs);color:var(--color-text-tertiary)">' +
              sells.length +
              ' ' +
              (sells.length === 1 ? 'fund' : 'funds') +
              '</div></div>'
            : '') +
          '<div class="stat-block" style="flex:1;min-width:120px"><div class="stat-block-label">Buy</div><div class="stat-block-value" style="font-size:var(--text-lg);color:var(--color-positive-text)">' +
          fmtCzk(buyTotal) +
          '</div><div style="font-size:var(--text-xs);color:var(--color-text-tertiary)">' +
          buys.length +
          ' ' +
          (buys.length === 1 ? 'fund' : 'funds') +
          '</div></div></div>' +
          '<div style="font-size:var(--text-sm);color:var(--color-text-secondary);line-height:var(--leading-relaxed)">' +
          escapeHtml(sells.length > 0 ? sells[0].reason : buys[0]?.reason ?? 'No actions this month') +
          '</div>'
      })
      .catch(() => {
        summary.innerHTML =
          '<div class="body-sm text-secondary">Could not load this month plan.</div>'
      })
  }

  function renderHealth(data) {
    const checks = data.checks ?? []
    const passing = checks.filter((c) => c.status === 'PASS').length
    const hp = document.getElementById('health-passing-count')
    const ht = document.getElementById('health-total-count')
    const htr = document.getElementById('health-trust')
    if (hp) hp.textContent = String(passing)
    if (ht) ht.textContent = String(checks.length)
    if (htr) htr.textContent = (data.trustScore ?? 0) + '%'

    const grid = document.getElementById('health-checks-grid')
    if (!grid) return
    const colorFor = (st) => {
      if (st === 'PASS') return 'var(--color-positive-base)'
      if (st === 'WARN') return 'var(--color-warning-base)'
      return 'var(--color-negative-base)'
    }
    grid.innerHTML = checks
      .map((c) => {
        const col = colorFor(c.status)
        return (
          '<div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);background:var(--color-bg-subtle);border-radius:var(--radius-md)">' +
          '<span style="color:' +
          col +
          ';font-size:14px" aria-hidden="true">●</span>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:var(--text-xs);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          escapeHtml(String(c.name).replace(/_/g, ' ')) +
          '</div>' +
          '<div style="font-size:10px;color:var(--color-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          escapeHtml(c.message ?? '') +
          '</div></div></div>'
        )
      })
      .join('')
  }

  loadOverview()
  loadHealth()

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    location.reload()
  })

  if (window.ArthaUI && typeof ArthaUI.initV4Shell === 'function') {
    ArthaUI.initV4Shell()
  }
})()
