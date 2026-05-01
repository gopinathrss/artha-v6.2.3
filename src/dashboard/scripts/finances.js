/**
 * /finances — V5 rebuild.
 *
 * Edits the user's profile, recurring income, fixed expenses and upcoming
 * events. Endpoints (preserved from V4):
 *
 *   GET    /api/profile         POST/PUT /api/profile
 *   GET    /api/income          POST    /api/income          DELETE /api/income/:id
 *   GET    /api/expenses        POST    /api/expenses        DELETE /api/expenses/:id
 *   GET    /api/events          POST    /api/events          DELETE /api/events/:id
 *
 * Decimal fields (amountCzk, amountLocal, budgetCzk, reservedCzk,
 * monthlyNetIncomeCzk, emergencyFundTarget, retirementMonthlyExpense)
 * arrive as strings — wrap with Number() before any arithmetic.
 */
;(function () {
  'use strict'

  const fmt0 = (n) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function dateInputValue(s) {
    if (!s) return ''
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function dateLabel(s) {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  async function loadProfile() {
    let p = {}
    try {
      const res = await fetch('/api/profile').then((r) => r.json())
      p = res?.data?.profile || {}
    } catch {}

    const set = (id, v) => {
      const el = document.getElementById(id)
      if (el != null && v != null) el.value = v
    }
    set('p_name', p.fullName)
    set('p_dob', dateInputValue(p.dateOfBirth))
    set('p_currency', p.homeCurrency)
    set('p_residency', p.taxResidency)
    set('p_risk', p.riskProfile)
    set('p_income', p.monthlyNetIncomeCzk)
    set('p_salary_day', p.salaryDayOfMonth)
    set('p_sip_day', p.sipDayOfMonth)
    set('p_emergency', p.emergencyFundTarget)
    set('p_ret_age', p.retirementAge)
    set('p_ret_exp', p.retirementMonthlyExpense)
    set('p_notes', p.notes)
  }

  async function saveProfile() {
    const get = (id) => document.getElementById(id)?.value
    const body = {
      fullName: get('p_name') || null,
      dateOfBirth: get('p_dob') ? new Date(get('p_dob')).toISOString() : null,
      homeCurrency: get('p_currency') || 'CZK',
      taxResidency: get('p_residency') || null,
      riskProfile: get('p_risk') || null,
      monthlyNetIncomeCzk: Number(get('p_income')) || 0,
      salaryDayOfMonth: Number(get('p_salary_day')) || null,
      sipDayOfMonth: Number(get('p_sip_day')) || null,
      emergencyFundTarget: Number(get('p_emergency')) || 0,
      retirementAge: Number(get('p_ret_age')) || null,
      retirementMonthlyExpense: Number(get('p_ret_exp')) || 0,
      notes: get('p_notes') || null
    }

    const btn = document.getElementById('save-profile-btn')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Saving…'
    }
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Save profile'
      }
    }
  }

  async function loadIncome() {
    let events = []
    try {
      const res = await fetch('/api/income').then((r) => r.json())
      events = res?.data?.events || []
    } catch {}

    const sub = document.getElementById('income-subtitle')
    sub.textContent =
      events.length + ' ' + (events.length === 1 ? 'event' : 'events')

    const tbody = document.getElementById('income-tbody')
    if (events.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="empty-state">
          <div class="empty-state-message">No income recorded yet.</div>
        </td></tr>
      `
      return
    }

    tbody.innerHTML = events
      .map(
        (e) => `
          <tr>
            <td><span class="text-secondary">${escapeHtml(dateLabel(e.date))}</span></td>
            <td><strong>${escapeHtml(e.source || '—')}</strong></td>
            <td class="num">${fmt0(e.amountCzk)} Kč</td>
            <td>${e.recurring ? '<span class="badge badge-positive">Recurring</span>' : '<span class="badge badge-neutral">One-off</span>'}</td>
            <td><button class="btn btn-ghost btn-sm" data-del-income="${escapeHtml(e.id)}" type="button">Remove</button></td>
          </tr>
        `
      )
      .join('')

    tbody.querySelectorAll('[data-del-income]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-income')
        if (!id || !window.confirm('Remove this income event?')) return
        btn.disabled = true
        await fetch('/api/income/' + encodeURIComponent(id), { method: 'DELETE' })
        await loadIncome()
      })
    })
  }

  async function addIncome() {
    const date = document.getElementById('i_date').value
    const src = document.getElementById('i_src').value.trim()
    const amt = Number(document.getElementById('i_amt').value)
    const rec = document.getElementById('i_rec').checked
    if (!date || !src || !(amt > 0)) {
      window.alert('Date, source and a positive amount are required.')
      return
    }
    const btn = document.getElementById('add-income')
    btn.disabled = true
    try {
      await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(date).toISOString(),
          source: src,
          amountCzk: amt,
          amountLocal: amt,
          currency: 'CZK',
          recurring: rec
        })
      })
      document.getElementById('i_date').value = ''
      document.getElementById('i_src').value = ''
      document.getElementById('i_amt').value = ''
      document.getElementById('i_rec').checked = false
      await loadIncome()
    } finally {
      btn.disabled = false
    }
  }

  async function loadExpenses() {
    let expenses = []
    try {
      const res = await fetch('/api/expenses').then((r) => r.json())
      expenses = res?.data?.expenses || []
    } catch {}

    document.getElementById('expenses-subtitle').textContent =
      expenses.length + ' ' + (expenses.length === 1 ? 'commitment' : 'commitments')

    const tbody = document.getElementById('expenses-tbody')
    if (expenses.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="empty-state">
          <div class="empty-state-message">No expenses recorded yet.</div>
        </td></tr>
      `
      return
    }

    tbody.innerHTML = expenses
      .map(
        (e) => `
          <tr>
            <td><strong>${escapeHtml(e.category || '—')}</strong></td>
            <td><span class="text-secondary">${escapeHtml(e.description || '—')}</span></td>
            <td class="num">${fmt0(e.amountCzk)} Kč</td>
            <td><span class="badge badge-neutral">${escapeHtml(e.frequency || '—')}</span></td>
            <td><button class="btn btn-ghost btn-sm" data-del-exp="${escapeHtml(e.id)}" type="button">Remove</button></td>
          </tr>
        `
      )
      .join('')

    tbody.querySelectorAll('[data-del-exp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-exp')
        if (!id || !window.confirm('Remove this expense?')) return
        btn.disabled = true
        await fetch('/api/expenses/' + encodeURIComponent(id), { method: 'DELETE' })
        await loadExpenses()
      })
    })
  }

  async function addExpense() {
    const cat = document.getElementById('e_cat').value.trim()
    const desc = document.getElementById('e_desc').value.trim()
    const amt = Number(document.getElementById('e_amt').value)
    const freq = document.getElementById('e_freq').value
    if (!cat || !(amt > 0)) {
      window.alert('Category and a positive amount are required.')
      return
    }
    const btn = document.getElementById('add-expense')
    btn.disabled = true
    try {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat,
          description: desc || cat,
          amountCzk: amt,
          frequency: freq,
          startDate: new Date().toISOString(),
          active: true
        })
      })
      document.getElementById('e_cat').value = ''
      document.getElementById('e_desc').value = ''
      document.getElementById('e_amt').value = ''
      await loadExpenses()
    } finally {
      btn.disabled = false
    }
  }

  async function loadEvents() {
    let events = []
    try {
      const res = await fetch('/api/events').then((r) => r.json())
      events = res?.data?.events || []
    } catch {}

    document.getElementById('events-subtitle').textContent =
      events.length + ' ' + (events.length === 1 ? 'event' : 'events')

    const tbody = document.getElementById('events-tbody')
    if (events.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="empty-state">
          <div class="empty-state-message">No upcoming events.</div>
        </td></tr>
      `
      return
    }

    tbody.innerHTML = events
      .map(
        (e) => `
          <tr>
            <td><span class="text-secondary">${escapeHtml(dateLabel(e.eventDate))}</span></td>
            <td><strong>${escapeHtml(e.title || '—')}</strong></td>
            <td><span class="badge badge-neutral">${escapeHtml(e.category || '—')}</span></td>
            <td class="num">${fmt0(e.budgetCzk)} Kč</td>
            <td class="num">${fmt0(e.reservedCzk)} Kč</td>
            <td><button class="btn btn-ghost btn-sm" data-del-ev="${escapeHtml(e.id)}" type="button">Remove</button></td>
          </tr>
        `
      )
      .join('')

    tbody.querySelectorAll('[data-del-ev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-ev')
        if (!id || !window.confirm('Remove this event?')) return
        btn.disabled = true
        await fetch('/api/events/' + encodeURIComponent(id), { method: 'DELETE' })
        await loadEvents()
      })
    })
  }

  async function addEvent() {
    const date = document.getElementById('v_date').value
    const title = document.getElementById('v_title').value.trim()
    const cat = document.getElementById('v_cat').value.trim()
    const budget = Number(document.getElementById('v_budget').value)
    const reserved = Number(document.getElementById('v_res').value) || 0
    if (!date || !title || !(budget > 0)) {
      window.alert('Date, title and a positive budget are required.')
      return
    }
    const btn = document.getElementById('add-event')
    btn.disabled = true
    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventDate: new Date(date).toISOString(),
          title,
          category: cat || 'OTHER',
          budgetCzk: budget,
          reservedCzk: reserved,
          status: 'UPCOMING'
        })
      })
      document.getElementById('v_date').value = ''
      document.getElementById('v_title').value = ''
      document.getElementById('v_cat').value = ''
      document.getElementById('v_budget').value = ''
      document.getElementById('v_res').value = '0'
      await loadEvents()
    } finally {
      btn.disabled = false
    }
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
  document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile)
  document.getElementById('add-income')?.addEventListener('click', addIncome)
  document.getElementById('add-expense')?.addEventListener('click', addExpense)
  document.getElementById('add-event')?.addEventListener('click', addEvent)

  Promise.allSettled([loadProfile(), loadIncome(), loadExpenses(), loadEvents()])
})()
