/**
 * /india — V5 rebuild.
 *
 * Pulls four endpoints concurrently:
 *   /api/india/mf       — Indian mutual funds + FX
 *   /api/india/fd       — Fixed deposits ladder
 *   /api/india/rates    — Published NRE FD rates from major banks
 *   /api/india/analysis — Best NRE 1yr, FCNR vs NRE, RBI policy
 *   /api/overview       — for NRE/NRO totals (already aggregated server-side)
 */
;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )
  const fmt2 = (n) => (Number(n) || 0).toFixed(2)

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function dateStr(s) {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function daysUntil(s) {
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  async function load() {
    const [mfRes, fdRes, ratesRes, analysisRes, overviewRes] = await Promise.allSettled([
      fetch('/api/india/mf').then((r) => r.json()),
      fetch('/api/india/fd').then((r) => r.json()),
      fetch('/api/india/rates').then((r) => r.json()),
      fetch('/api/india/analysis').then((r) => r.json()),
      fetch('/api/overview').then((r) => r.json())
    ])

    const mfData = mfRes.status === 'fulfilled' ? mfRes.value?.data || {} : {}
    const fdData = fdRes.status === 'fulfilled' ? fdRes.value?.data || {} : {}
    const ratesData = ratesRes.status === 'fulfilled' ? ratesRes.value?.data || {} : {}
    const analysisData = analysisRes.status === 'fulfilled' ? analysisRes.value?.data || {} : {}
    const overview = overviewRes.status === 'fulfilled' ? overviewRes.value?.data || {} : {}

    renderHero(mfData, fdData, overview)
    renderMutualFunds(mfData)
    renderFds(fdData)
    renderAnalysis(analysisData)
    renderRates(ratesData)
  }

  function renderHero(mfData, fdData, overview) {
    const nw = overview.netWorth || {}
    const nreCzk = Number(nw.indiaNRECzk) || 0
    const nroCzk = Number(nw.indiaNROCzk) || 0
    const mfCzk = Number(nw.indiaMfCzk) || 0
    const fdCzk = Number(nw.indiaFDCzk) || 0
    const totalCzk = nreCzk + nroCzk + mfCzk + fdCzk

    document.getElementById('hero-total').textContent = fmt0(totalCzk) + ' Kč'
    const fundCount = (mfData.funds || []).length
    const fdCount = (fdData.fds || []).length
    document.getElementById('hero-sub').textContent =
      fundCount + ' ' + (fundCount === 1 ? 'fund' : 'funds') +
      ' · ' + fdCount + ' ' + (fdCount === 1 ? 'FD' : 'FDs')

    document.getElementById('stat-nre').textContent = nreCzk > 0 ? fmt0(nreCzk) + ' Kč' : '—'
    document.getElementById('stat-nro').textContent = nroCzk > 0 ? fmt0(nroCzk) + ' Kč' : '—'
    document.getElementById('stat-mf').textContent = mfCzk > 0 ? fmt0(mfCzk) + ' Kč' : '—'
    document.getElementById('stat-fd').textContent = fdCzk > 0 ? fmt0(fdCzk) + ' Kč' : '—'
  }

  function renderMutualFunds(mfData) {
    const funds = mfData.funds || []
    const czkPerInr = Number(mfData.czkPerInr) || 0

    document.getElementById('mf-subtitle').textContent =
      funds.length + ' ' + (funds.length === 1 ? 'fund' : 'funds') +
      (czkPerInr > 0 ? ` · 1 INR = ${fmt2(czkPerInr)} Kč` : '')

    const tbody = document.getElementById('mf-tbody')
    if (funds.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-state-message">No Indian mutual funds yet. Add some in Settings.</div>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = funds
      .map((f) => {
        const valueInr = Number(f.valueInr) || (Number(f.units) * Number(f.nav)) || 0
        const valueCzk = Number(f.valueCzk) || valueInr * czkPerInr
        return `
          <tr>
            <td>
              <div class="fund-name">${escapeHtml(f.scheme || f.name || '—')}</div>
              ${f.isin ? `<div class="fund-isin">${escapeHtml(f.isin)}</div>` : ''}
            </td>
            <td><span class="text-secondary">${escapeHtml(f.amc || '—')}</span></td>
            <td class="num">${fmt2(f.units)}</td>
            <td class="num">${fmt2(f.nav)}</td>
            <td class="num">₹${fmt0(valueInr)}</td>
            <td class="num"><strong>${fmt0(valueCzk)} Kč</strong></td>
          </tr>
        `
      })
      .join('')
  }

  function renderFds(fdData) {
    const fds = fdData.fds || []
    document.getElementById('fd-subtitle').textContent =
      fds.length + ' ' + (fds.length === 1 ? 'deposit' : 'deposits')

    const tbody = document.getElementById('fd-tbody')
    if (fds.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-state-message">No fixed deposits yet.</div>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = fds
      .map((fd) => {
        const days = daysUntil(fd.maturityDate)
        let daysCell = '—'
        if (days != null) {
          const cls = days < 30 ? 'badge-warning' : days < 180 ? 'badge-info' : 'badge-neutral'
          daysCell = `<span class="badge ${cls}">${days}d</span>`
        }
        return `
          <tr>
            <td><strong>${escapeHtml(fd.bank || '—')}</strong></td>
            <td><span class="text-secondary">${escapeHtml(fd.type || fd.acctType || '—')}</span></td>
            <td class="num">₹${fmt0(fd.principalInr || fd.principal)}</td>
            <td class="num">${fmt2(fd.ratePct || fd.rate)}</td>
            <td><span class="text-secondary">${escapeHtml(dateStr(fd.maturityDate))}</span></td>
            <td class="num">${daysCell}</td>
          </tr>
        `
      })
      .join('')
  }

  function renderAnalysis(analysis) {
    const best = analysis.bestNre1yr || {}
    document.getElementById('best-nre-rate').textContent =
      best.value != null ? fmt2(best.value) + '%' : '—'
    document.getElementById('best-nre-bank').textContent = best.bank
      ? `${best.bank} · ${best.tenor || '1yr'}`
      : '—'
    const rbi = analysis.rbi || {}
    document.getElementById('best-nre-meta').textContent = rbi.value
      ? `RBI policy: ${fmt2(rbi.value)}% · ${rbi.changeDirection || 'STABLE'}`
      : '—'

    const fcnr = analysis.fcnrVsNre || {}
    if (fcnr.recommendation) {
      document.getElementById('fcnr-body').textContent = fcnr.recommendation
    } else {
      document.getElementById('fcnr-body').textContent = 'Live FX needed for comparison.'
    }
  }

  function renderRates(ratesData) {
    const rates = (ratesData.rates || [])
      .filter((r) => r.dataType === 'NRE_FD_RATE')
      .sort((a, b) => {
        if (a.bankName !== b.bankName) return a.bankName.localeCompare(b.bankName)
        return String(a.tenor).localeCompare(String(b.tenor))
      })

    const tbody = document.getElementById('rates-tbody')
    if (rates.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="3" class="empty-state">
          <div class="empty-state-message">No reference rates loaded.</div>
        </td></tr>
      `
      return
    }

    tbody.innerHTML = rates
      .map(
        (r) => `
          <tr>
            <td>${escapeHtml(r.bankName || '—')}</td>
            <td><span class="text-secondary">${escapeHtml(r.tenor || '—')}</span></td>
            <td class="num"><strong>${fmt2(r.value)}%</strong></td>
          </tr>
        `
      )
      .join('')
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
  document.getElementById('refresh-nav-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-nav-btn')
    if (!btn) return
    btn.disabled = true
    btn.textContent = 'Refreshing…'
    try {
      await fetch('/api/india/refresh-nav', { method: 'POST' })
      await load()
    } finally {
      btn.disabled = false
      btn.textContent = 'Refresh NAV'
    }
  })

  load().catch(() => {
    document.getElementById('mf-tbody').innerHTML = `
      <tr><td colspan="6" class="empty-state">
        <div class="empty-state-message">Could not load India data. Try refresh.</div>
      </td></tr>
    `
  })
})()
