/**
 * /onboarding — V5 wizard rebuild.
 *
 * Same 5-step flow as V4, restyled with V5 cards + form-field utilities.
 * Submits to POST /api/profile/onboarding-complete (preserved). Wraps every
 * Decimal write in Number() so a string accidentally pasted in an income
 * box can't crash the JSON body.
 *
 * No sidebar by design — it's a first-run wizard, full-page max-width 600.
 */
;(function () {
  'use strict'

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  let step = 1
  let risk = 'MODERATE'
  let expenses = []
  let events = []

  const FIX_PRESET = [
    { category: 'HOUSING', description: 'Rent', amountCzk: 18000, dueDay: 1 },
    { category: 'UTIL', description: 'Utilities', amountCzk: 4000, dueDay: 5 },
    { category: 'FOOD', description: 'Groceries', amountCzk: 8000, dueDay: 1 },
    { category: 'TRANSPORT', description: 'Transport', amountCzk: 1500, dueDay: 1 },
    { category: 'TEL', description: 'Phone', amountCzk: 1500, dueDay: 1 },
    { category: 'INS', description: 'Insurance', amountCzk: 2000, dueDay: 1 }
  ]

  const CATEGORIES = ['HOUSING', 'UTIL', 'FOOD', 'TRANSPORT', 'TEL', 'INS', 'SUB', 'OTHER']

  function paintDots() {
    document.getElementById('dots').innerHTML = [1, 2, 3, 4, 5]
      .map((n) => `<span class="wizard-dot${n === step ? ' on' : ''}"></span>`)
      .join('')
  }

  function show(n) {
    step = n
    document.querySelectorAll('.onb-step').forEach((s) => {
      s.style.display = parseInt(s.getAttribute('data-step') || '0', 10) === n ? 'block' : 'none'
    })
    paintDots()
    if (n === 3) {
      if (expenses.length === 0) addExpenseRow()
      renderExp()
    }
    if (n === 4) recomputeEmergency()
    if (n === 5) renderEv()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function sumFixed() {
    return expenses.reduce((s, e) => s + (Number(e.amountCzk) || 0), 0)
  }

  function recomputeEmergency() {
    const t = sumFixed()
    const el = document.getElementById('p_emg')
    if (!el.value || el.value === '0') el.value = String(Math.round(t * 6))
  }

  function renderExp() {
    const inc = Number(document.getElementById('p_income').value) || 0
    const tot = sumFixed()
    const pct = inc > 0 ? Math.round((tot / inc) * 100) : 0
    const el = document.getElementById('fixTotal')
    el.innerHTML =
      `Fixed costs: <strong>${tot.toLocaleString('en-US')} CZK</strong> / month` +
      (inc > 0 ? ` · ${pct}% of income` : '')
    el.style.color =
      pct === 0 ? 'var(--color-text-tertiary)' :
      pct < 50 ? 'var(--color-positive-text)' :
      pct < 70 ? 'var(--color-warning-text)' :
      'var(--color-negative-text)'

    const root = document.getElementById('expRoot')
    root.innerHTML = expenses
      .map((e, i) => {
        const opts = CATEGORIES.map(
          (c) => `<option value="${c}"${e.category === c ? ' selected' : ''}>${c}</option>`
        ).join('')
        return `
          <div style="display: grid; grid-template-columns: 1fr 1.4fr 0.8fr 0.5fr auto; gap: var(--space-2); margin-bottom: var(--space-2); align-items: center;">
            <select class="form-field-select exp-c" data-i="${i}">${opts}</select>
            <input class="form-field-input exp-d" data-i="${i}" placeholder="Description" value="${escapeHtml(e.description || '')}" />
            <input class="form-field-input exp-a" data-i="${i}" type="number" min="0" step="100" value="${Number(e.amountCzk) || 0}" />
            <input class="form-field-input exp-day" data-i="${i}" type="number" min="1" max="28" value="${Number(e.dueDay) || 1}" />
            <button class="btn btn-ghost btn-sm" data-rm="${i}" type="button" aria-label="Remove">×</button>
          </div>
        `
      })
      .join('')

    root.querySelectorAll('.exp-c').forEach((sel) => {
      sel.addEventListener('change', () => {
        expenses[Number(sel.dataset.i)].category = sel.value
      })
    })
    root.querySelectorAll('.exp-d').forEach((inp) => {
      inp.addEventListener('input', () => {
        expenses[Number(inp.dataset.i)].description = inp.value
      })
    })
    root.querySelectorAll('.exp-a').forEach((inp) => {
      inp.addEventListener('input', () => {
        expenses[Number(inp.dataset.i)].amountCzk = Number(inp.value) || 0
        const inc = Number(document.getElementById('p_income').value) || 0
        const tot = sumFixed()
        const pct = inc > 0 ? Math.round((tot / inc) * 100) : 0
        document.getElementById('fixTotal').innerHTML =
          `Fixed costs: <strong>${tot.toLocaleString('en-US')} CZK</strong> / month` +
          (inc > 0 ? ` · ${pct}% of income` : '')
      })
    })
    root.querySelectorAll('.exp-day').forEach((inp) => {
      inp.addEventListener('input', () => {
        expenses[Number(inp.dataset.i)].dueDay = Math.min(
          28,
          Math.max(1, parseInt(inp.value, 10) || 1)
        )
      })
    })
    root.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        expenses.splice(Number(btn.dataset.rm), 1)
        renderExp()
      })
    })
  }

  function addExpenseRow() {
    expenses.push({ category: 'OTHER', description: '', amountCzk: 0, dueDay: 1 })
  }

  function renderEv() {
    const root = document.getElementById('evRoot')
    if (events.length === 0) {
      root.innerHTML =
        `<div class="form-field-help">No events — optional. You can add them later in Finances.</div>`
      return
    }
    root.innerHTML = events
      .map(
        (e, i) => `
          <div style="display: grid; grid-template-columns: 1fr 1.4fr 1fr 1fr auto; gap: var(--space-2); margin-bottom: var(--space-2); align-items: center;">
            <input class="form-field-input ev-d" data-i="${i}" type="date" value="${escapeHtml(e.eventDate || '')}" />
            <input class="form-field-input ev-t" data-i="${i}" placeholder="Title" value="${escapeHtml(e.title || '')}" />
            <input class="form-field-input ev-c" data-i="${i}" placeholder="Category" value="${escapeHtml(e.category || '')}" />
            <input class="form-field-input ev-b" data-i="${i}" type="number" min="0" step="500" value="${Number(e.budgetCzk) || 0}" />
            <button class="btn btn-ghost btn-sm" data-erm="${i}" type="button" aria-label="Remove">×</button>
          </div>
        `
      )
      .join('')

    root.querySelectorAll('.ev-d').forEach((inp) => {
      inp.addEventListener('change', () => {
        events[Number(inp.dataset.i)].eventDate = inp.value
      })
    })
    root.querySelectorAll('.ev-t').forEach((inp) => {
      inp.addEventListener('input', () => {
        events[Number(inp.dataset.i)].title = inp.value
      })
    })
    root.querySelectorAll('.ev-c').forEach((inp) => {
      inp.addEventListener('input', () => {
        events[Number(inp.dataset.i)].category = inp.value
      })
    })
    root.querySelectorAll('.ev-b').forEach((inp) => {
      inp.addEventListener('input', () => {
        events[Number(inp.dataset.i)].budgetCzk = Number(inp.value) || 0
      })
    })
    root.querySelectorAll('[data-erm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        events.splice(Number(btn.dataset.erm), 1)
        renderEv()
      })
    })
  }

  function targetsForRisk() {
    if (risk === 'CONSERVATIVE') return { e: 40, b: 50, c: 10 }
    if (risk === 'GROWTH') return { e: 80, b: 15, c: 5 }
    return { e: 65, b: 25, c: 10 }
  }

  document.getElementById('btnCzech')?.addEventListener('click', () => {
    expenses = JSON.parse(JSON.stringify(FIX_PRESET))
    renderExp()
  })

  document.getElementById('btnAddExp')?.addEventListener('click', () => {
    addExpenseRow()
    renderExp()
  })

  document.getElementById('btnAddEv')?.addEventListener('click', () => {
    events.push({
      eventDate: new Date().toISOString().slice(0, 10),
      title: '',
      category: 'TRIP',
      budgetCzk: 0
    })
    renderEv()
  })

  document.getElementById('btnSkipEv')?.addEventListener('click', () => {
    events = []
    finish()
  })

  document.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => {
      const n = parseInt(b.getAttribute('data-goto') || '0', 10)
      if (n === 2) {
        if (
          !document.getElementById('p_name').value.trim() ||
          !document.getElementById('p_dob').value
        ) {
          window.alert('Name and date of birth are required.')
          return
        }
      }
      if (n === 3) {
        const inc = Number(document.getElementById('p_income').value)
        if (!Number.isFinite(inc) || inc < 0) {
          window.alert('Enter a valid net income.')
          return
        }
      }
      if (n === 4) {
        if (sumFixed() <= 0) {
          window.alert('Add at least one fixed expense.')
          return
        }
        recomputeEmergency()
      }
      show(n)
    })
  })

  document.getElementById('riskRow')?.addEventListener('click', (e) => {
    const t = e.target
    const r = t.getAttribute && t.getAttribute('data-risk')
    if (!r) return
    risk = r
    document.getElementById('p_risk').value = risk
    document.querySelectorAll('#riskRow [data-risk]').forEach((x) => {
      const isActive = x.getAttribute('data-risk') === risk
      x.classList.toggle('btn-primary', isActive)
      x.classList.toggle('btn-secondary', !isActive)
    })
  })

  function finish() {
    const btn = document.getElementById('btnFinish')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Saving…'
    }
    const t = targetsForRisk()
    const out = {
      profile: {
        fullName: document.getElementById('p_name').value.trim() || 'User',
        dateOfBirth: document.getElementById('p_dob').value,
        taxResidency: document.getElementById('p_tax').value,
        homeCurrency: document.getElementById('p_ccy').value,
        monthlyNetIncomeCzk: Number(document.getElementById('p_income').value) || 0,
        salaryDayOfMonth: Math.min(
          31,
          Math.max(1, parseInt(document.getElementById('p_sal').value, 10) || 15)
        ),
        riskProfile: document.getElementById('p_risk').value,
        retirementAge: Math.min(
          80,
          Math.max(40, parseInt(document.getElementById('p_rtg').value, 10) || 50)
        ),
        retirementMonthlyExpense: Number(document.getElementById('p_rtm').value) || 0,
        emergencyFundTarget: Number(document.getElementById('p_emg').value) || 0,
        targetEquityPct: t.e,
        targetBondsPct: t.b,
        targetCashPct: t.c
      },
      expenses: expenses.map((e) => ({
        category: e.category,
        description: e.description || e.category,
        amountCzk: Number(e.amountCzk) || 0,
        dueDayOfMonth: e.dueDay != null ? e.dueDay : 1,
        frequency: 'MONTHLY'
      })),
      events: events
        .filter((x) => x.title && x.eventDate)
        .map((x) => ({
          eventDate: x.eventDate,
          title: x.title,
          category: x.category || 'OTHER',
          budgetCzk: Number(x.budgetCzk) || 0
        }))
    }

    fetch('/api/profile/onboarding-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out)
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || 'bad response')
        window.location.href = '/this-month'
      })
      .catch(() => {
        window.alert('Save failed — turn off demo in Settings or check the server.')
        if (btn) {
          btn.disabled = false
          btn.textContent = 'Finish setup'
        }
      })
  }

  document.getElementById('btnFinish')?.addEventListener('click', finish)

  show(1)
  paintDots()
})()
