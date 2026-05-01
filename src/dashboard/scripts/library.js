/**
 * /library — V5 rebuild.
 *
 * GET /api/library returns Prisma rows where every numeric field
 * (terPct, return3yr, score, etc.) is a Decimal serialised as string.
 * EVERY arithmetic / .toFixed / Math op MUST wrap with Number() — this
 * is the page that crashed in Sprint 2 with `.toFixed is not a function`.
 *
 * Helpers fmt0/fmt1/fmt2 do this, plus an explicit Number() at the
 * source on each read (defensive — survives renamed fields).
 */
;(function () {
  'use strict'

  const fmt1 = (n) => (Number(n) || 0).toFixed(1)
  const fmt2 = (n) => (Number(n) || 0).toFixed(2)

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function scoreBucket(score) {
    const s = Number(score) || 0
    if (s >= 90) return { cls: 'strong', label: 'Strong ' + s }
    if (s >= 75) return { cls: 'good', label: 'Good ' + s }
    if (s >= 50) return { cls: 'fair', label: 'Fair ' + s }
    return { cls: 'weak', label: 'Weak ' + s }
  }

  let allInstruments = []

  async function load() {
    let data = {}
    try {
      const res = await fetch('/api/library').then((r) => r.json())
      data = res?.data || {}
    } catch {}

    allInstruments = data.instruments || []
    renderHero(allInstruments)
    applyFilters()
  }

  function renderHero(insts) {
    document.getElementById('hero-count').textContent = String(insts.length)

    const inGeorge = insts.filter((i) => i.availableInGeorge).length
    document.getElementById('stat-george').textContent =
      inGeorge + ' / ' + insts.length

    const scores = insts.map((i) => Number(i.score) || 0).filter((s) => s > 0)
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0
    document.getElementById('stat-avg-score').textContent = avgScore > 0 ? String(avgScore) : '—'

    const ters = insts.map((i) => Number(i.terPct) || 0).filter((t) => t > 0)
    const avgTer = ters.length > 0 ? ters.reduce((a, b) => a + b, 0) / ters.length : 0
    document.getElementById('stat-avg-ter').textContent =
      avgTer > 0 ? fmt2(avgTer) + '%' : '—'

    const counts = { EQUITY: 0, BONDS: 0, CASH: 0, COMMODITY: 0, OTHER: 0 }
    insts.forEach((i) => {
      const c = String(i.category || 'OTHER').toUpperCase()
      counts[c] = (counts[c] || 0) + 1
    })
    document.getElementById('stat-mix').textContent =
      counts.EQUITY + ' / ' + counts.BONDS + ' / ' + counts.CASH
  }

  function applyFilters() {
    const cat = document.getElementById('filter-category').value
    const search = document.getElementById('filter-search').value.trim().toLowerCase()
    const georgeOnly = document.getElementById('filter-george').checked

    let filtered = allInstruments.slice()

    if (cat) {
      filtered = filtered.filter((i) => String(i.category).toUpperCase() === cat)
    }
    if (search) {
      filtered = filtered.filter((i) => {
        const hay = (
          (i.name || '') + ' ' + (i.isin || '') + ' ' + (i.ticker || '')
        ).toLowerCase()
        return hay.includes(search)
      })
    }
    if (georgeOnly) {
      filtered = filtered.filter((i) => !!i.availableInGeorge)
    }

    filtered.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))

    document.getElementById('lib-subtitle').textContent =
      filtered.length + ' ' + (filtered.length === 1 ? 'fund' : 'funds') +
      ' shown · sorted by score'

    const tbody = document.getElementById('lib-tbody')
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="empty-state">
          <div class="empty-state-message">No funds match these filters.</div>
        </td></tr>
      `
      return
    }

    tbody.innerHTML = filtered
      .map((i) => {
        const ter = Number(i.terPct) || 0
        const ret3 = Number(i.return3yr)
        const ret3Str = Number.isFinite(ret3)
          ? (ret3 >= 0 ? '+' : '') + fmt1(ret3) + '%'
          : '—'
        const ret3Cls = Number.isFinite(ret3)
          ? ret3 >= 0
            ? 'text-positive'
            : 'text-negative'
          : 'text-tertiary'

        const bucket = scoreBucket(i.score)
        return `
          <tr>
            <td>
              <div class="fund-name">${escapeHtml(i.name || '—')}</div>
              <div class="fund-isin">${escapeHtml(i.isin || '')}</div>
            </td>
            <td><span class="text-secondary">${escapeHtml(i.category || '—')}</span></td>
            <td class="num">${fmt2(ter)}</td>
            <td class="num"><span class="${ret3Cls}">${ret3Str}</span></td>
            <td><span class="score-badge ${bucket.cls}">${escapeHtml(bucket.label)}</span></td>
            <td>${i.availableInGeorge ? '<span class="badge badge-positive">Yes</span>' : '<span class="badge badge-neutral">No</span>'}</td>
          </tr>
        `
      })
      .join('')
  }

  document.getElementById('filter-category')?.addEventListener('change', applyFilters)
  document.getElementById('filter-search')?.addEventListener('input', applyFilters)
  document.getElementById('filter-george')?.addEventListener('change', applyFilters)
  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())

  load().catch(() => {
    document.getElementById('lib-tbody').innerHTML = `
      <tr><td colspan="6" class="empty-state">
        <div class="empty-state-message">Could not load library. Try refresh.</div>
      </td></tr>
    `
  })
})()
