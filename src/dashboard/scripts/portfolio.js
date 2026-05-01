/**
 * /portfolio — V5 rebuild.
 *
 * Loads /api/holdings (full list, sorted by current value desc) plus
 * /api/overview (for net worth + invested totals). Renders a hero with the
 * total portfolio value and a single dense table of every holding.
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

  async function load() {
    const [holdingsRes, overviewRes] = await Promise.allSettled([
      fetch('/api/holdings').then((r) => r.json()),
      fetch('/api/overview').then((r) => r.json())
    ])

    const holdings =
      holdingsRes.status === 'fulfilled' ? holdingsRes.value?.data?.holdings || [] : []
    const overview =
      overviewRes.status === 'fulfilled' ? overviewRes.value?.data || {} : {}

    renderHero(holdings, overview)
    renderTable(holdings)
  }

  function renderHero(holdings, overview) {
    const totalCzk =
      Number(overview?.netWorth?.totalCzk) ||
      holdings.reduce((s, h) => s + (Number(h.currentValueCzk) || 0), 0)

    const active = holdings.filter((h) => String(h.status).toUpperCase() === 'ACTIVE').length
    const inactive = holdings.length - active

    const invested = Number(overview?.totalInvested) || 0
    const gainCzk = Number(overview?.netWorth?.gainCzk)
    const gainPct = Number(overview?.netWorth?.gainPct)

    document.getElementById('hero-total').textContent = fmt0(totalCzk) + ' Kč'
    document.getElementById('hero-sub').textContent =
      holdings.length + ' ' + (holdings.length === 1 ? 'holding' : 'holdings') + ' tracked'
    document.getElementById('stat-active').textContent = String(active)
    document.getElementById('stat-inactive').textContent = String(inactive)
    document.getElementById('stat-invested').textContent =
      invested > 0 ? fmt0(invested) + ' Kč' : '—'

    const gainEl = document.getElementById('stat-gain')
    if (Number.isFinite(gainCzk) && Number.isFinite(gainPct)) {
      const positive = gainCzk >= 0
      gainEl.textContent = (positive ? '+' : '') + fmt0(gainCzk) + ' Kč'
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
    if (holdings.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <div class="empty-state-message">No holdings yet. Add some in Settings → Czech holdings.</div>
          </td>
        </tr>
      `
      return
    }

    const sorted = holdings
      .slice()
      .sort((a, b) => (Number(b.currentValueCzk) || 0) - (Number(a.currentValueCzk) || 0))

    tbody.innerHTML = sorted
      .map(
        (h) => `
          <tr>
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
          </tr>
        `
      )
      .join('')
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())

  load().catch(() => {
    document.getElementById('holdings-tbody').innerHTML = `
      <tr><td colspan="8" class="empty-state">
        <div class="empty-state-message">Could not load holdings. Try refresh.</div>
      </td></tr>
    `
  })
})()
