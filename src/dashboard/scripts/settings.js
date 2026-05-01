/**
 * /settings — V5 rebuild.
 *
 * 8 cards in scope per Sprint 3 spec:
 *   1. Appearance     — re-uses /scripts/theme.js radio picker
 *   2. Allocation targets   — POST /api/settings { targetEquityPct, ... }
 *   3. Email ingestion       — POST /api/settings { autoIngestEmails, imap* }
 *   4. Notifications         — POST /api/settings { alertEmail, telegramChatId,
 *                                                    monthlyLetterEnabled,
 *                                                    alertsEnabled }
 *   5. Demo mode             — POST /api/settings { demoModeEnabled, demoPersona }
 *   6. AI provider           — POST /api/settings { aiProvider, openaiApiKey }
 *   7. System health         — GET  /api/health, render checks
 *   8. Data & backups        — info callout (server-side endpoints)
 *
 * V4-only sections (Czech holdings admin, India accounts, NRE FD admin)
 * are intentionally deferred to Sprint 4 — surfaced in the Data card.
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

  // ---------- Appearance (theme picker) ----------
  function initThemePicker() {
    const current =
      window.ArthaTheme && typeof window.ArthaTheme.getPreference === 'function'
        ? window.ArthaTheme.getPreference()
        : 'system'
    const radio =
      document.querySelector(`input[name="theme"][value="${current}"]`) ||
      document.querySelector('input[name="theme"][value="system"]')
    if (radio) radio.checked = true

    document.querySelectorAll('input[name="theme"]').forEach((r) => {
      r.addEventListener('change', (e) => {
        const v = e.target.value
        if (window.ArthaTheme && typeof window.ArthaTheme.setPreference === 'function') {
          window.ArthaTheme.setPreference(v)
        }
      })
    })
  }

  // ---------- Settings load / save plumbing ----------
  let currentSettings = {}

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings').then((r) => r.json())
      currentSettings = res?.data?.settings || {}
    } catch {}

    const set = (id, v) => {
      const el = document.getElementById(id)
      if (el == null || v == null) return
      if (el.type === 'checkbox') el.checked = !!v
      else el.value = v
    }

    set('t_eq', currentSettings.targetEquityPct)
    set('t_bd', currentSettings.targetBondsPct)
    set('t_cs', currentSettings.targetCashPct)
    updateTargetsSum()

    set('i_auto', currentSettings.autoIngestEmails)
    set('i_host', currentSettings.imapHost)
    set('i_port', currentSettings.imapPort)
    set('i_user', currentSettings.imapUser)
    // imapPassword may be masked or absent — leave blank so user can set new one

    set('n_email', currentSettings.alertEmail)
    set('n_tg', currentSettings.telegramChatId)
    set('n_monthly', currentSettings.monthlyLetterEnabled)
    set('n_alerts', currentSettings.alertsEnabled)

    set('d_enabled', currentSettings.demoModeEnabled)
    set('d_persona', currentSettings.demoPersona)

    set('ai_provider', currentSettings.aiProvider)
    // openaiApiKey masked — user pastes new value to overwrite
  }

  function patch(body) {
    return fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => r.json())
  }

  async function withButton(id, label, action) {
    const btn = document.getElementById(id)
    if (!btn) return action()
    btn.disabled = true
    btn.textContent = 'Saving…'
    try {
      await action()
    } finally {
      btn.disabled = false
      btn.textContent = label
    }
  }

  function updateTargetsSum() {
    const eq = Number(document.getElementById('t_eq').value) || 0
    const bd = Number(document.getElementById('t_bd').value) || 0
    const cs = Number(document.getElementById('t_cs').value) || 0
    const sum = eq + bd + cs
    const el = document.getElementById('targets-sum')
    if (sum === 100) {
      el.textContent = `Sum: ${sum}%`
      el.style.color = 'var(--color-positive-text)'
    } else {
      el.textContent = `Sum: ${sum}% (must equal 100%)`
      el.style.color = 'var(--color-warning-text)'
    }
  }

  // ---------- System health ----------
  async function loadHealth() {
    let data = {}
    try {
      const res = await fetch('/api/health').then((r) => r.json())
      data = res?.data || {}
    } catch {}

    const checks = data.checks || []
    const passing = checks.filter((c) => c.status === 'PASS').length
    document.getElementById('h-passing').textContent = String(passing)
    document.getElementById('h-total').textContent = String(checks.length)
    document.getElementById('h-trust').textContent =
      data.trustScore != null ? Number(data.trustScore) + '%' : '—'

    // Sidebar trust score
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

    const grid = document.getElementById('health-grid')
    if (checks.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-message">No health checks loaded.</div></div>`
      return
    }
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

  // ---------- Wire-up ----------
  initThemePicker()
  loadSettings()
  loadHealth()

  ;['t_eq', 't_bd', 't_cs'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateTargetsSum)
  })

  document.getElementById('save-targets')?.addEventListener('click', () =>
    withButton('save-targets', 'Save', async () => {
      await patch({
        targetEquityPct: Number(document.getElementById('t_eq').value) || 0,
        targetBondsPct: Number(document.getElementById('t_bd').value) || 0,
        targetCashPct: Number(document.getElementById('t_cs').value) || 0
      })
    })
  )

  document.getElementById('save-imap')?.addEventListener('click', () =>
    withButton('save-imap', 'Save', async () => {
      const body = {
        autoIngestEmails: document.getElementById('i_auto').checked,
        imapHost: document.getElementById('i_host').value || null,
        imapPort: Number(document.getElementById('i_port').value) || 993,
        imapUser: document.getElementById('i_user').value || null
      }
      const pwd = document.getElementById('i_pwd').value
      if (pwd) body.imapPassword = pwd
      await patch(body)
      document.getElementById('i_pwd').value = ''
    })
  )

  document.getElementById('test-imap')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-imap')
    btn.disabled = true
    const orig = btn.textContent
    btn.textContent = 'Testing…'
    try {
      const r = await fetch('/api/ingestion/test-connection', { method: 'POST' })
      const j = await r.json().catch(() => null)
      btn.textContent = j?.success ? 'Connected ✓' : 'Failed'
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    } catch {
      btn.textContent = 'Failed'
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    }
  })

  document.getElementById('run-imap')?.addEventListener('click', async () => {
    const btn = document.getElementById('run-imap')
    btn.disabled = true
    const orig = btn.textContent
    btn.textContent = 'Running…'
    try {
      await fetch('/api/ingestion/run', { method: 'POST' })
      btn.textContent = 'Done ✓'
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    } catch {
      btn.textContent = 'Failed'
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    }
  })

  document.getElementById('save-notify')?.addEventListener('click', () =>
    withButton('save-notify', 'Save', async () => {
      await patch({
        alertEmail: document.getElementById('n_email').value || null,
        telegramChatId: document.getElementById('n_tg').value || null,
        monthlyLetterEnabled: document.getElementById('n_monthly').checked,
        alertsEnabled: document.getElementById('n_alerts').checked
      })
    })
  )

  document.getElementById('save-demo')?.addEventListener('click', () =>
    withButton('save-demo', 'Apply', async () => {
      await patch({
        demoModeEnabled: document.getElementById('d_enabled').checked,
        demoPersona: document.getElementById('d_persona').value || 'engineer'
      })
    })
  )

  document.getElementById('save-ai')?.addEventListener('click', () =>
    withButton('save-ai', 'Save', async () => {
      const body = {
        aiProvider: document.getElementById('ai_provider').value || 'anthropic'
      }
      const key = document.getElementById('ai_openai_key').value
      if (key) body.openaiApiKey = key
      await patch(body)
      document.getElementById('ai_openai_key').value = ''
    })
  )

  document.getElementById('reload-health')?.addEventListener('click', loadHealth)
  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
})()
