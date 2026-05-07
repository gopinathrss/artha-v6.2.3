/**
 * /accounts — V6.
 * Full CRUD for the Account model: bank, savings, pension, NRE/NRO, FDs.
 * Uses PieFetch + PieUi.
 */
;(function () {
  'use strict'

  const TYPES = [
    { value: 'SAVINGS', label: 'Savings' },
    { value: 'CURRENT', label: 'Current / Checking' },
    { value: 'PENSION', label: 'Pension' },
    { value: 'FIXED_DEPOSIT', label: 'Fixed deposit' },
    { value: 'NRE', label: 'NRE' },
    { value: 'NRO', label: 'NRO' },
    { value: 'FCNR', label: 'FCNR' },
    { value: 'BROKERAGE_CASH', label: 'Brokerage cash' }
  ]
  const COUNTRIES = [
    { value: 'CZ', label: 'Czech Republic' },
    { value: 'IN', label: 'India' },
    { value: 'EU', label: 'EU (other)' },
    { value: 'US', label: 'United States' },
    { value: 'OTHER', label: 'Other' }
  ]
  const CURRENCIES = ['CZK', 'EUR', 'USD', 'INR', 'GBP']

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

  let cached = []
  let fxCzkPerUnit = { EUR: null, USD: null, INR: null, GBP: null }

  function toCzk(amount, currency) {
    const c = String(currency || 'CZK').toUpperCase()
    if (c === 'CZK') return Number(amount) || 0
    const rate = fxCzkPerUnit[c]
    if (!rate) return null
    return (Number(amount) || 0) * rate
  }

  async function load() {
    try {
      const [a, fx] = await Promise.all([
        PieFetch.get('/api/accounts'),
        PieFetch.get('/api/currency/rates').catch(() => null)
      ])
      cached = a?.data?.accounts || []
      const r = fx?.data?.czkPerUnit || {}
      fxCzkPerUnit = {
        EUR: Number(r.EUR) || null,
        USD: Number(r.USD) || null,
        INR: Number(r.INR) || null,
        GBP: Number(r.GBP) || null
      }
      renderHero(cached)
      renderTable(cached)
    } catch (e) {
      document.getElementById('accounts-tbody').innerHTML =
        '<tr><td colspan="8" class="empty-state"><div class="empty-state-message">' +
        escapeHtml('Could not load accounts: ' + (e.message || e)) +
        '</div></td></tr>'
    }
  }

  function renderHero(accounts) {
    const active = accounts.filter((a) => a.isActive !== false)
    let totalCzk = 0
    const sums = { CZK: 0, EUR: 0, INR: 0 }
    active.forEach((a) => {
      const c = String(a.currency || 'CZK').toUpperCase()
      const bal = Number(a.balanceLocal) || 0
      if (sums[c] != null) sums[c] += bal
      const inCzk = toCzk(bal, c)
      if (inCzk != null) totalCzk += inCzk
    })
    document.getElementById('hero-total').textContent = fmt0(totalCzk) + ' Kč'
    document.getElementById('stat-active').textContent = String(active.length)
    document.getElementById('stat-czk').textContent = fmt0(sums.CZK) + ' Kč'
    document.getElementById('stat-eur').textContent = fmt0(sums.EUR) + ' €'
    document.getElementById('stat-inr').textContent = '₹ ' + fmt0(sums.INR)
    document.getElementById('accounts-subtitle').textContent =
      active.length + ' active · ' + (accounts.length - active.length) + ' inactive'
  }

  function renderTable(accounts) {
    const tbody = document.getElementById('accounts-tbody')
    if (!accounts.length) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="empty-state">
          <div class="empty-state-cta">
            <div class="empty-state-message">No accounts yet. Add your first bank/savings/pension account.</div>
            <button class="btn btn-primary btn-sm" id="empty-add-btn" type="button">+ Add account</button>
          </div>
        </td></tr>`
      const a = document.getElementById('empty-add-btn')
      if (a) a.addEventListener('click', () => openDrawer(null))
      return
    }
    tbody.innerHTML = accounts
      .map((a) => {
        const c = String(a.currency || 'CZK').toUpperCase()
        const bal = Number(a.balanceLocal) || 0
        const czk = toCzk(bal, c)
        return `
        <tr data-id="${escapeHtml(a.id)}">
          <td>
            <div class="fund-name">${escapeHtml(a.name)}</div>
            ${a.notes ? '<div class="fund-isin">' + escapeHtml(a.notes) + '</div>' : ''}
          </td>
          <td><span class="pie-chip">${escapeHtml(a.type || '—')}</span></td>
          <td>${escapeHtml(a.institution || '—')}</td>
          <td>${escapeHtml(a.country || '—')}</td>
          <td class="num"><strong>${fmt0(bal)} ${escapeHtml(c)}</strong></td>
          <td class="num">${czk != null ? fmt0(czk) + ' Kč' : '—'}</td>
          <td class="num">${a.interestRatePct != null ? fmt2(a.interestRatePct) + '%' : '—'}</td>
          <td class="num">
            <button class="btn btn-ghost btn-sm" data-act="edit" type="button">Edit</button>
          </td>
        </tr>`
      })
      .join('')
    Array.from(tbody.querySelectorAll('button[data-act="edit"]')).forEach((b) => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('tr').getAttribute('data-id')
        const a = cached.find((x) => x.id === id)
        if (a) openDrawer(a)
      })
    })
  }

  function openDrawer(a) {
    const isNew = !a
    const html = `
      <form class="pie-form" id="acc-form" autocomplete="off">
        <div class="pie-form-field">
          <label for="f_name">Name</label>
          <input id="f_name" name="name" value="${escapeHtml(a?.name || '')}" required />
        </div>
        <div class="pie-form-row">
          <div class="pie-form-field">
            <label for="f_type">Type</label>
            <select id="f_type" name="type">${TYPES.map(
              (t) => '<option value="' + t.value + '"' + (a?.type === t.value ? ' selected' : '') + '>' + t.label + '</option>'
            ).join('')}</select>
          </div>
          <div class="pie-form-field">
            <label for="f_country">Country</label>
            <select id="f_country" name="country">${COUNTRIES.map(
              (c) => '<option value="' + c.value + '"' + ((a?.country || 'CZ') === c.value ? ' selected' : '') + '>' + c.label + '</option>'
            ).join('')}</select>
          </div>
        </div>
        <div class="pie-form-field">
          <label for="f_institution">Institution</label>
          <input id="f_institution" name="institution" value="${escapeHtml(a?.institution || '')}" />
        </div>
        <div class="pie-form-row">
          <div class="pie-form-field">
            <label for="f_balance">Balance</label>
            <input id="f_balance" name="balanceLocal" type="number" step="0.01" value="${a?.balanceLocal != null ? a.balanceLocal : ''}" required />
          </div>
          <div class="pie-form-field">
            <label for="f_currency">Currency</label>
            <select id="f_currency" name="currency">${CURRENCIES.map(
              (c) => '<option value="' + c + '"' + ((a?.currency || 'CZK') === c ? ' selected' : '') + '>' + c + '</option>'
            ).join('')}</select>
          </div>
        </div>
        <div class="pie-form-row">
          <div class="pie-form-field">
            <label for="f_rate">Interest rate (% p.a.)</label>
            <input id="f_rate" name="interestRatePct" type="number" step="0.01" value="${a?.interestRatePct != null ? a.interestRatePct : ''}" />
          </div>
          <div class="pie-form-field">
            <label for="f_maturity">Maturity (FDs)</label>
            <input id="f_maturity" name="maturityDate" type="date" value="${
              a?.maturityDate ? new Date(a.maturityDate).toISOString().slice(0, 10) : ''
            }" />
          </div>
        </div>
        <div class="pie-form-field">
          <label for="f_notes">Notes</label>
          <textarea id="f_notes" name="notes" rows="2">${escapeHtml(a?.notes || '')}</textarea>
        </div>
        ${
          isNew
            ? ''
            : `<label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);color:var(--color-text-secondary)">
                 <input type="checkbox" id="f_active" ${a.isActive !== false ? 'checked' : ''} /> Account is active (uncheck to archive)
               </label>`
        }
      </form>`
    const dr = PieUi.drawer({ title: isNew ? 'Add account' : 'Edit account', bodyHtml: html })
    dr.setFooter([
      isNew
        ? null
        : PieUi.btn(
            'Delete…',
            async () => {
              const ok = await PieUi.confirm({
                title: 'Archive account?',
                message: 'This soft-deletes (sets isActive=false). History is preserved.',
                tone: 'danger',
                confirmLabel: 'Archive'
              })
              if (!ok) return
              try {
                await PieFetch.delete('/api/accounts/' + encodeURIComponent(a.id))
                PieUi.toast('Account archived', 'success')
                dr.close()
                await load()
              } catch (e) {
                PieUi.toast('Delete failed: ' + (e.message || e), 'error')
              }
            }
          ),
      PieUi.btn('Cancel', () => dr.close()),
      PieUi.btn(
        isNew ? 'Create' : 'Save',
        async () => {
          const f = document.getElementById('acc-form')
          if (!f.reportValidity()) return
          const fd = new FormData(f)
          const body = {}
          fd.forEach((v, k) => {
            if (v === '' || v == null) return
            if (['balanceLocal', 'interestRatePct'].includes(k)) body[k] = Number(v)
            else body[k] = v
          })
          if (!isNew) body.isActive = !!document.getElementById('f_active')?.checked
          try {
            if (isNew) await PieFetch.post('/api/accounts', body)
            else await PieFetch.put('/api/accounts/' + encodeURIComponent(a.id), body)
            PieUi.toast('Saved', 'success')
            dr.close()
            await load()
          } catch (e) {
            PieUi.toast('Save failed: ' + (e.message || e), 'error')
          }
        },
        'primary'
      )
    ])
  }

  document.getElementById('add-account-btn')?.addEventListener('click', () => openDrawer(null))
  document.getElementById('refresh-btn')?.addEventListener('click', () => load())
  load()
})()
