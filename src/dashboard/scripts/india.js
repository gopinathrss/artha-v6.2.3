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

  let mfRaw = []
  let fdRaw = []

  function renderMutualFunds(mfData) {
    const funds = mfData.funds || []
    mfRaw = funds.slice()
    const czkPerInr = Number(mfData.czkPerInr) || 0

    document.getElementById('mf-subtitle').textContent =
      funds.length + ' ' + (funds.length === 1 ? 'fund' : 'funds') +
      (czkPerInr > 0 ? ` · 1 INR = ${fmt2(czkPerInr)} Kč` : '')

    const tbody = document.getElementById('mf-tbody')
    if (funds.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="empty-state">
          <div class="empty-state-cta">
            <div class="empty-state-message">No Indian mutual funds yet.</div>
            <button class="btn btn-primary btn-sm" id="empty-mf-btn" type="button">+ Add fund</button>
          </div>
        </td></tr>`
      const e = document.getElementById('empty-mf-btn')
      if (e) e.addEventListener('click', () => openMfDrawer(null))
      return
    }

    tbody.innerHTML = funds
      .map((f) => {
        const valueInr = Number(f.valueInr) || (Number(f.units) * Number(f.nav)) || 0
        const valueCzk = Number(f.valueCzk) || valueInr * czkPerInr
        return `
          <tr data-id="${escapeHtml(f.id || '')}">
            <td>
              <div class="fund-name">${escapeHtml(f.scheme || f.name || '—')}</div>
              ${f.isin ? `<div class="fund-isin">${escapeHtml(f.isin)}</div>` : ''}
            </td>
            <td><span class="text-secondary">${escapeHtml(f.amc || '—')}</span></td>
            <td class="num">${fmt2(f.units)}</td>
            <td class="num">${fmt2(f.nav)}</td>
            <td class="num">₹${fmt0(valueInr)}</td>
            <td class="num"><strong>${fmt0(valueCzk)} Kč</strong></td>
            <td class="num">
              <button class="btn btn-ghost btn-sm" data-mf-act="edit" type="button">Edit</button>
            </td>
          </tr>`
      })
      .join('')

    Array.from(tbody.querySelectorAll('button[data-mf-act="edit"]')).forEach((b) =>
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('tr').getAttribute('data-id')
        const f = mfRaw.find((x) => x.id === id)
        if (f) openMfDrawer(f)
      })
    )
  }

  function renderFds(fdData) {
    const fds = fdData.fds || []
    fdRaw = fds.slice()
    document.getElementById('fd-subtitle').textContent =
      fds.length + ' ' + (fds.length === 1 ? 'deposit' : 'deposits')

    const tbody = document.getElementById('fd-tbody')
    if (fds.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="empty-state">
          <div class="empty-state-cta">
            <div class="empty-state-message">No fixed deposits yet.</div>
            <button class="btn btn-primary btn-sm" id="empty-fd-btn" type="button">+ Add FD</button>
          </div>
        </td></tr>`
      const e = document.getElementById('empty-fd-btn')
      if (e) e.addEventListener('click', () => openFdDrawer(null))
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
          <tr data-id="${escapeHtml(fd.id || '')}">
            <td><strong>${escapeHtml(fd.bank || '—')}</strong></td>
            <td><span class="text-secondary">${escapeHtml(fd.accountType || fd.type || '—')}</span></td>
            <td class="num">₹${fmt0(fd.principalInr || fd.principal)}</td>
            <td class="num">${fmt2(fd.interestRatePct || fd.ratePct || fd.rate)}</td>
            <td><span class="text-secondary">${escapeHtml(dateStr(fd.maturityDate))}</span></td>
            <td class="num">${daysCell}</td>
            <td class="num">
              <button class="btn btn-ghost btn-sm" data-fd-act="edit" type="button">Edit</button>
            </td>
          </tr>`
      })
      .join('')

    Array.from(tbody.querySelectorAll('button[data-fd-act="edit"]')).forEach((b) =>
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('tr').getAttribute('data-id')
        const fd = fdRaw.find((x) => x.id === id)
        if (fd) openFdDrawer(fd)
      })
    )
  }

  function fHtml(label, name, value, type, attrs) {
    return (
      '<div class="pie-form-field"><label for="if_' + name + '">' + escapeHtml(label) + '</label>' +
      '<input id="if_' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' +
      escapeHtml(value == null ? '' : String(value)) + '" ' + (attrs || '') + ' /></div>'
    )
  }
  function selHtml(label, name, value, options) {
    return (
      '<div class="pie-form-field"><label for="if_' + name + '">' + escapeHtml(label) + '</label>' +
      '<select id="if_' + name + '" name="' + name + '">' +
      options.map((o) =>
        '<option value="' + escapeHtml(o.value) + '"' +
        (String(o.value) === String(value) ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>'
      ).join('') +
      '</select></div>'
    )
  }
  function dateInput(d) {
    if (!d) return ''
    const dt = new Date(d)
    if (Number.isNaN(dt.getTime())) return ''
    return dt.toISOString().slice(0, 10)
  }

  function openMfDrawer(f) {
    const isNew = !f
    const html = `
      <form class="pie-form" id="mf-form" autocomplete="off">
        ${fHtml('Scheme name', 'schemeName', f?.scheme || f?.schemeName, 'text', 'required')}
        <div class="pie-form-row">
          ${fHtml('AMFI code', 'amfiCode', f?.amfiCode, 'text', 'required')}
          ${fHtml('ISIN', 'isin', f?.isin)}
        </div>
        <div class="pie-form-row">
          ${fHtml('AMC', 'amc', f?.amc)}
          ${selHtml('Category', 'category', f?.category || 'EQUITY', [
            { value: 'EQUITY', label: 'Equity' },
            { value: 'DEBT', label: 'Debt' },
            { value: 'HYBRID', label: 'Hybrid' },
            { value: 'INDEX', label: 'Index' },
            { value: 'ELSS', label: 'ELSS (tax saver)' },
            { value: 'OTHER', label: 'Other' }
          ])}
        </div>
        <div class="pie-form-row">
          ${fHtml('Units', 'units', f?.units, 'number', 'step="0.0001" required')}
          ${fHtml('Avg buy NAV (₹)', 'avgNavInr', f?.avgNavInr, 'number', 'step="0.0001"')}
        </div>
        <div class="pie-form-row">
          ${fHtml('Current NAV (₹)', 'currentNavInr', f?.currentNavInr || f?.nav, 'number', 'step="0.0001"')}
          ${fHtml('Purchase date', 'purchaseDate', dateInput(f?.purchaseDate), 'date', 'required')}
        </div>
        <div class="pie-form-row">
          ${fHtml('Folio number', 'folioNumber', f?.folioNumber)}
          ${fHtml('Monthly SIP (₹)', 'sipAmountInr', f?.sipAmountInr, 'number', 'step="1"')}
        </div>
      </form>`
    const dr = PieUi.drawer({ title: isNew ? 'Add mutual fund' : 'Edit mutual fund', bodyHtml: html })
    dr.setFooter([
      isNew
        ? null
        : PieUi.btn('Delete…', async () => {
            const ok = await PieUi.confirm({
              title: 'Delete fund?',
              message: 'Permanent — units, NAV history and SIP rows for this fund will be removed.',
              tone: 'danger',
              confirmLabel: 'Delete'
            })
            if (!ok) return
            try {
              await PieFetch.delete('/api/india/mf/' + encodeURIComponent(f.id))
              PieUi.toast('Fund deleted', 'success')
              dr.close()
              await load()
            } catch (e) {
              PieUi.toast('Delete failed: ' + (e.message || e), 'error')
            }
          }),
      PieUi.btn('Cancel', () => dr.close()),
      PieUi.btn(isNew ? 'Create' : 'Save', async () => {
        const f2 = document.getElementById('mf-form')
        if (!f2.reportValidity()) return
        const fd = new FormData(f2)
        const body = {}
        fd.forEach((v, k) => {
          if (v === '' || v == null) return
          if (['units', 'avgNavInr', 'currentNavInr', 'sipAmountInr'].includes(k)) body[k] = Number(v)
          else body[k] = v
        })
        if (body.sipAmountInr) body.sipActive = true
        try {
          if (isNew) await PieFetch.post('/api/india/mf', body)
          else await PieFetch.patch('/api/india/mf/' + encodeURIComponent(f.id), body)
          PieUi.toast('Saved', 'success')
          dr.close()
          await load()
        } catch (e) {
          PieUi.toast('Save failed: ' + (e.message || e), 'error')
        }
      }, 'primary')
    ])
  }

  function openFdDrawer(fd) {
    const isNew = !fd
    const html = `
      <form class="pie-form" id="fd-form" autocomplete="off">
        ${fHtml('Bank', 'bank', fd?.bank, 'text', 'required')}
        ${selHtml('Account type', 'accountType', fd?.accountType || 'NRE', [
          { value: 'NRE', label: 'NRE FD' },
          { value: 'NRO', label: 'NRO FD' },
          { value: 'FCNR', label: 'FCNR FD' },
          { value: 'RESIDENT', label: 'Resident FD' }
        ])}
        <div class="pie-form-row">
          ${fHtml('Principal (₹)', 'principalInr', fd?.principalInr, 'number', 'step="1" required')}
          ${fHtml('Interest rate (% p.a.)', 'interestRatePct', fd?.interestRatePct, 'number', 'step="0.01" required')}
        </div>
        <div class="pie-form-row">
          ${fHtml('Start date', 'startDate', dateInput(fd?.startDate), 'date', 'required')}
          ${fHtml('Maturity date', 'maturityDate', dateInput(fd?.maturityDate), 'date', 'required')}
        </div>
        ${selHtml('Interest type', 'interestType', fd?.interestType || 'CUMULATIVE', [
          { value: 'CUMULATIVE', label: 'Cumulative (paid at maturity)' },
          { value: 'PAYOUT', label: 'Periodic payout' }
        ])}
      </form>`
    const dr = PieUi.drawer({ title: isNew ? 'Add fixed deposit' : 'Edit fixed deposit', bodyHtml: html })
    dr.setFooter([
      isNew
        ? null
        : PieUi.btn('Delete…', async () => {
            const ok = await PieUi.confirm({
              title: 'Delete FD?',
              message: 'Permanent.',
              tone: 'danger',
              confirmLabel: 'Delete'
            })
            if (!ok) return
            try {
              await PieFetch.delete('/api/india/fd/' + encodeURIComponent(fd.id))
              PieUi.toast('FD deleted', 'success')
              dr.close()
              await load()
            } catch (e) {
              PieUi.toast('Delete failed: ' + (e.message || e), 'error')
            }
          }),
      PieUi.btn('Cancel', () => dr.close()),
      PieUi.btn(isNew ? 'Create' : 'Save', async () => {
        const f2 = document.getElementById('fd-form')
        if (!f2.reportValidity()) return
        const fdat = new FormData(f2)
        const body = {}
        fdat.forEach((v, k) => {
          if (v === '' || v == null) return
          if (['principalInr', 'interestRatePct'].includes(k)) body[k] = Number(v)
          else body[k] = v
        })
        try {
          if (isNew) await PieFetch.post('/api/india/fd', body)
          else await PieFetch.patch('/api/india/fd/' + encodeURIComponent(fd.id), body)
          PieUi.toast('Saved', 'success')
          dr.close()
          await load()
        } catch (e) {
          PieUi.toast('Save failed: ' + (e.message || e), 'error')
        }
      }, 'primary')
    ])
  }

  document.getElementById('add-mf-btn')?.addEventListener('click', () => openMfDrawer(null))
  document.getElementById('add-fd-btn')?.addEventListener('click', () => openFdDrawer(null))

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
