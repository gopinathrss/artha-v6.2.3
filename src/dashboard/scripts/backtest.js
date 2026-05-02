;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
  const fmt1 = (n) => (Number(n) || 0).toFixed(1)
  const fmt2 = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(2))

  function todayISO() {
    return new Date().toISOString().slice(0, 10)
  }

  function addYears(iso, y) {
    const d = new Date(iso + 'T12:00:00')
    d.setFullYear(d.getFullYear() - y)
    return d.toISOString().slice(0, 10)
  }

  function setPeriodYears(y) {
    document.getElementById('qc-end').value = todayISO()
    document.getElementById('qc-start').value = addYears(todayISO(), y)
  }

  function metricCard(title, r, highlight) {
    const cagr = fmt1(r.cagr)
    const dd = fmt1(r.maxDrawdown)
    const sh = r.sharpe == null ? '—' : fmt2(r.sharpe)
    const fin = fmt0(r.finalValueCzk)
    const border = highlight ? '2px solid var(--color-positive-text)' : '1px solid var(--color-border-default)'
    return `
      <div class="card" style="padding: var(--space-4); border: ${border}; border-radius: var(--radius-lg);">
        <div class="hero-eyebrow">${title}</div>
        <div style="font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: var(--space-2) 0;">CAGR ${cagr}%</div>
        <div class="hero-stats" style="grid-template-columns: 1fr 1fr; gap: var(--space-2);">
          <div class="hero-stat"><div class="hero-stat-label">Max DD</div><div class="hero-stat-value">${dd}%</div></div>
          <div class="hero-stat"><div class="hero-stat-label">Sharpe</div><div class="hero-stat-value">${sh}</div></div>
        </div>
        <div class="hero-meta" style="margin-top: var(--space-2)">Final ${fin} Kč</div>
      </div>
    `
  }

  function pickWinner(cur, eq, bal) {
    const a = [
      { k: 'cur', v: Number(cur.cagr) || 0 },
      { k: 'eq', v: Number(eq.cagr) || 0 },
      { k: 'bal', v: Number(bal.cagr) || 0 }
    ]
    a.sort((x, y) => y.v - x.v)
    return a[0].k
  }

  async function runQuickCompare() {
    const start = document.getElementById('qc-start').value
    const end = document.getElementById('qc-end').value
    const initial = Number(document.getElementById('qc-initial').value) || 100000
    const sip = Number(document.getElementById('qc-sip').value) || 0
    const btn = document.getElementById('qc-run')
    btn.disabled = true
    try {
      const q = new URLSearchParams({
        startDate: start,
        endDate: end,
        initialValueCzk: String(initial),
        monthlySipCzk: String(sip)
      })
      const res = await fetch('/api/backtest/compare?' + q.toString()).then((r) => r.json())
      if (!res.success) throw new Error(res.error || 'compare failed')
      const { current, allEquity, balanced } = res.data
      const w = pickWinner(current, allEquity, balanced)
      document.getElementById('qc-results').innerHTML = `
        <div class="overview-row-2col" style="gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          ${metricCard('Current portfolio', current, w === 'cur')}
          ${metricCard('All-equity (VWCE)', allEquity, w === 'eq')}
          ${metricCard('60/30/10 balanced', balanced, w === 'bal')}
        </div>
      `
      const colors = [
        'var(--color-accent-base)',
        'var(--color-positive-text)',
        'var(--color-info-text)'
      ]
      const series = [
        { label: 'Current', color: colors[0], points: current.monthlyValues.map((p) => ({ x: p.date, y: p.valueCzk })) },
        { label: 'VWCE', color: colors[1], points: allEquity.monthlyValues.map((p) => ({ x: p.date, y: p.valueCzk })) },
        { label: '60/30/10', color: colors[2], points: balanced.monthlyValues.map((p) => ({ x: p.date, y: p.valueCzk })) }
      ]
      const el = document.getElementById('qc-chart')
      if (window.ArthaChart) window.ArthaChart.renderSvgMultiLineChart(el, series)
    } catch (e) {
      document.getElementById('qc-results').innerHTML =
        '<p class="text-negative">' + (e.message || 'Error') + '</p>'
    } finally {
      btn.disabled = false
    }
  }

  function ensureCustomRows() {
    const wrap = document.getElementById('custom-holdings-rows')
    if (!wrap.querySelector('.custom-row')) {
      wrap.innerHTML = `
        <div class="form-row custom-row">
          <input class="form-field-input" placeholder="ISIN" value="IE00BK5BQT80" />
          <input class="form-field-input" placeholder="Weight %" type="number" value="100" />
        </div>`
    }
  }

  function collectCustomHoldings() {
    const rows = document.querySelectorAll('#custom-holdings-rows .custom-row')
    const out = []
    rows.forEach((row) => {
      const inputs = row.querySelectorAll('input')
      const isin = String(inputs[0]?.value || '').trim()
      const w = Number(inputs[1]?.value) || 0
      if (isin) out.push({ isin, weightPct: w })
    })
    return out
  }

  async function runCustom() {
    const strategy = document.getElementById('cb-strategy').value
    const body = {
      strategy,
      startDate: document.getElementById('cb-start').value,
      endDate: document.getElementById('cb-end').value,
      initialValueCzk: Number(document.getElementById('cb-initial').value) || 100000,
      monthlySipCzk: Number(document.getElementById('cb-sip').value) || 0,
      rebalanceFrequencyDays: Number(document.getElementById('cb-reb').value) || 0
    }
    if (strategy === 'CUSTOM') body.holdings = collectCustomHoldings()
    const btn = document.getElementById('cb-run')
    btn.disabled = true
    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.json())
      if (!res.success) throw new Error(res.error || 'run failed')
      const d = res.data
      const warns =
        (d.warnings || []).length > 0
          ? '<ul style="font-size:var(--text-xs);color:var(--color-text-tertiary);">' +
            d.warnings.map((w) => '<li>' + String(w) + '</li>').join('') +
            '</ul>'
          : ''
      document.getElementById('cb-result').innerHTML =
        metricCard('Result', d, false) +
        (d.cached ? '<p class="card-subtitle">Served from 24h cache.</p>' : '') +
        warns
      const el = document.getElementById('cb-chart')
      if (window.ArthaChart && d.monthlyValues)
        window.ArthaChart.renderSvgMultiLineChart(el, [
          { label: 'Portfolio', color: 'var(--color-accent-base)', points: d.monthlyValues.map((p) => ({ x: p.date, y: p.valueCzk })) }
        ])
      loadRuns()
    } catch (e) {
      document.getElementById('cb-result').innerHTML =
        '<p class="text-negative">' + (e.message || 'Error') + '</p>'
    } finally {
      btn.disabled = false
    }
  }

  async function loadRuns() {
    const res = await fetch('/api/backtest/runs').then((r) => r.json())
    const tb = document.getElementById('runs-tbody')
    if (!res.success || !Array.isArray(res.data)) {
      tb.innerHTML = ''
      return
    }
    tb.innerHTML = res.data
      .map((row) => {
        const cagr = row.cagrPct != null ? fmt1(row.cagrPct) : '—'
        const fin = row.finalValueCzk != null ? fmt0(row.finalValueCzk) : '—'
        const sd = row.startDate ? String(row.startDate).slice(0, 10) : ''
        const ed = row.endDate ? String(row.endDate).slice(0, 10) : ''
        const ran = row.startedAt ? String(row.startedAt).slice(0, 19).replace('T', ' ') : ''
        return `<tr>
          <td>${row.strategyName}</td>
          <td>${sd} → ${ed}</td>
          <td class="num">${cagr}</td>
          <td class="num">${fin}</td>
          <td>${ran}</td>
        </tr>`
      })
      .join('')
  }

  document.querySelectorAll('.period-preset').forEach((b) => {
    b.addEventListener('click', () => setPeriodYears(Number(b.getAttribute('data-years'))))
  })
  document.getElementById('qc-run').addEventListener('click', runQuickCompare)
  document.getElementById('btn-quick-compare').addEventListener('click', runQuickCompare)
  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadRuns()
    location.reload()
  })

  document.getElementById('cb-strategy').addEventListener('change', () => {
    const custom = document.getElementById('cb-strategy').value === 'CUSTOM'
    document.getElementById('custom-holdings-wrap').style.display = custom ? 'block' : 'none'
    if (custom) ensureCustomRows()
  })
  document.getElementById('cb-add-row').addEventListener('click', () => {
    const wrap = document.getElementById('custom-holdings-rows')
    const div = document.createElement('div')
    div.className = 'form-row custom-row'
    div.style.marginTop = 'var(--space-2)'
    div.innerHTML =
      '<input class="form-field-input" placeholder="ISIN" /><input class="form-field-input" placeholder="Weight %" type="number" value="0" />'
    wrap.appendChild(div)
  })
  document.getElementById('cb-run').addEventListener('click', runCustom)

  document.getElementById('lesson-load').addEventListener('click', async () => {
    const isin = String(document.getElementById('lesson-isin').value || '').trim()
    const panel = document.getElementById('lesson-panel')
    if (!isin) {
      panel.textContent = 'Enter an ISIN.'
      return
    }
    panel.textContent = 'Loading…'
    try {
      const res = await fetch('/api/lessons/by-isin/' + encodeURIComponent(isin)).then((r) => r.json())
      if (!res.success) throw new Error(res.error || 'failed')
      const rows = res.data || []
      if (!rows.length) {
        panel.textContent = 'No lessons for this ISIN yet. Run historical import, then generate a plan with a BUY to that fund.'
        return
      }
      const L = rows[0]
      panel.textContent =
        (L.narrative || '') +
        '\n\n' +
        (L.patternIds && L.patternIds.length ? 'Patterns: ' + L.patternIds.join(', ') : '')
    } catch (e) {
      panel.textContent = String(e.message || e)
    }
  })

  setPeriodYears(3)
  document.getElementById('cb-start').value = document.getElementById('qc-start').value
  document.getElementById('cb-end').value = document.getElementById('qc-end').value

  loadRuns()
})()
