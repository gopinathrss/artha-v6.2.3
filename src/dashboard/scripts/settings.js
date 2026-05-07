/**
 * /settings — V5 dashboard + V5.2 AppSettings / Integrations UI.
 *
 * Legacy: POST /api/settings (allocation, IMAP, notifications, demo).
 * V5.2: GET/POST /api/app-settings, GET/POST /api/integrations/*.
 */
;(function () {
  'use strict'

  const INTEGRATION_ORDER = [
    'ai.anthropic',
    'ai.openai',
    'ai.gemini',
    'comms.smtp',
    'comms.telegram',
    'comms.imap',
    'fx.exchangerate-api'
  ]

  const NON_AI_INTEGRATION_ORDER = INTEGRATION_ORDER.filter((k) => !k.startsWith('ai.'))

  const AI_INTEGRATION_KEYS = ['ai.openai', 'ai.anthropic', 'ai.gemini']

  const AI_MODEL_PRESETS = {
    'ai.openai': ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'gpt-4-turbo'],
    'ai.anthropic': ['claude-sonnet-4-5', 'claude-haiku-4-5-20251001'],
    'ai.gemini': ['gemini-1.5-pro', 'gemini-1.5-flash']
  }

  const INTEG_LABELS = {
    'ai.anthropic': 'Anthropic Claude',
    'ai.openai': 'OpenAI',
    'ai.gemini': 'Google Gemini',
    'comms.smtp': 'SMTP',
    'comms.telegram': 'Telegram Bot',
    'comms.imap': 'IMAP',
    'fx.exchangerate-api': 'ExchangeRate-API'
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatSettingsTime() {
    return new Date().toLocaleString()
  }

  /** Same visual language as AI status: Saved / Failed + summary + timestamp. */
  function paintSectionStatus(mountId, ok, summary, detail) {
    const el = document.getElementById(mountId)
    if (!el) return
    el.style.display = 'block'
    const badge = ok ? '✅ Saved' : '❌ Failed'
    const cls = ok ? 'ai-status-ok' : 'ai-status-fail'
    el.className = 'ai-status-panel settings-section-status ' + cls
    el.innerHTML =
      '<div><strong>Status:</strong> ' +
      badge +
      '</div>' +
      '<div><strong>Summary:</strong> ' +
      escapeHtml(summary || '—') +
      '</div>' +
      '<div><strong>Time:</strong> ' +
      escapeHtml(formatSettingsTime()) +
      '</div>' +
      (detail ? '<div><strong>Detail:</strong> ' + escapeHtml(detail) + '</div>' : '')
  }

  function paintIntegrationBlockStatus(key, ok, mode, message, latencyMs) {
    const el = document.querySelector('[data-integ-panel="' + key + '"]')
    if (!el) return
    el.style.display = 'block'
    const badge =
      mode === 'test'
        ? ok
          ? '✅ OK'
          : '❌ Failed'
        : mode === 'clear'
          ? ok
            ? '✅ Cleared'
            : '❌ Failed'
          : ok
            ? '✅ Saved'
            : '❌ Save failed'
    const headline =
      mode === 'test' ? 'Last test' : mode === 'clear' ? 'Last action' : 'Last saved'
    const cls = ok ? 'ai-status-ok' : 'ai-status-fail'
    el.className = 'ai-status-panel settings-integ-status ' + cls
    const lat =
      latencyMs != null && Number.isFinite(Number(latencyMs))
        ? '<div><strong>Latency:</strong> ' + escapeHtml(String(latencyMs)) + ' ms</div>'
        : ''
    el.innerHTML =
      '<div><strong>Status:</strong> ' +
      badge +
      '</div>' +
      '<div><strong>' +
      escapeHtml(headline) +
      ':</strong> ' +
      escapeHtml(formatSettingsTime()) +
      '</div>' +
      lat +
      '<div><strong>Detail:</strong> ' +
      escapeHtml(message || '—') +
      '</div>'
  }

  function slug(key) {
    return key.replace(/\./g, '-')
  }

  /** After Google redirects back, strip query params and show SMTP status. */
  function consumeGmailOAuthFromUrl() {
    try {
      const u = new URL(window.location.href)
      const g = u.searchParams.get('gmail_oauth')
      if (!g) return
      const reason = u.searchParams.get('reason') || ''
      u.searchParams.delete('gmail_oauth')
      u.searchParams.delete('reason')
      const qs = u.searchParams.toString()
      window.history.replaceState({}, document.title, u.pathname + (qs ? '?' + qs : '') + u.hash)
      if (g === 'ok') {
        paintIntegrationBlockStatus(
          'comms.smtp',
          true,
          'save',
          'Gmail OAuth linked — refresh token saved on comms.smtp. Use Test, then Notifications → Send test email.',
          null
        )
      } else {
        paintIntegrationBlockStatus(
          'comms.smtp',
          false,
          'save',
          decodeURIComponent(reason) || 'Google sign-in failed',
          null
        )
      }
      const panel = document.querySelector('[data-integ-panel="comms.smtp"]')
      if (panel) panel.style.display = 'block'
    } catch {
      /* */
    }
  }

  function integVal(v) {
    if (v == null || v === '') return ''
    return String(v)
  }

  function categoryForKey(key) {
    if (key.startsWith('ai.')) return 'ai'
    if (key.startsWith('comms.')) return 'communications'
    if (key.startsWith('fx.')) return 'financial'
    return 'system'
  }

  function readSecretInput(id) {
    const el = document.getElementById(id)
    if (!el) return undefined
    const v = el.value.trim()
    if (!v) return undefined
    if (v.startsWith('•')) return undefined
    return v
  }

  /** JSON fetch with timeout; throws on non-JSON or HTTP error. */
  async function fetchJsonTimeout(url, init, timeoutMs) {
    const ms = timeoutMs || 25_000
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), ms)
    try {
      const r = await fetch(url, {
        ...init,
        credentials: init && init.credentials != null ? init.credentials : 'same-origin',
        signal: ac.signal
      })
      const text = await r.text()
      let j
      try {
        j = text.trim().length ? JSON.parse(text) : {}
      } catch {
        throw new Error('Non-JSON response (' + r.status + '): ' + text.slice(0, 180))
      }
      if (!r.ok) {
        const msg = j && (j.error || j.message) ? String(j.error || j.message) : text.slice(0, 180)
        throw new Error(msg || 'HTTP ' + r.status)
      }
      return j
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Request timed out after ' + ms / 1000 + 's: ' + url)
      throw e
    } finally {
      clearTimeout(t)
    }
  }

  // ---------- Appearance (theme picker) ----------
  /** Map DB/localStorage (AUTO/LIGHT/DARK) to HTML radio values (system/light/dark). */
  function themeRadioValue() {
    const themeApi = window.PieTheme || window.ArthaTheme
    const p = themeApi && typeof themeApi.getPreference === 'function' ? themeApi.getPreference() : 'system'
    const u = String(p || 'system').toUpperCase()
    if (u === 'AUTO') return 'system'
    if (u === 'LIGHT') return 'light'
    if (u === 'DARK') return 'dark'
    if (p === 'light' || p === 'dark') return p
    return 'system'
  }

  function themeSegmentForPreference() {
    const v = themeRadioValue()
    return v === 'system' ? 'auto' : v
  }

  function syncThemeSegmentUI() {
    const cur = themeSegmentForPreference()
    document.querySelectorAll('.theme-seg').forEach((btn) => {
      const on = btn.getAttribute('data-theme-seg') === cur
      btn.classList.toggle('is-active', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
  }

  function initThemeSegmented() {
    syncThemeSegmentUI()
    document.querySelectorAll('.theme-seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        const seg = btn.getAttribute('data-theme-seg')
        const pref = seg === 'auto' ? 'system' : seg === 'light' ? 'light' : 'dark'
        const ta = window.PieTheme || window.ArthaTheme
        if (ta && typeof ta.setPreference === 'function') {
          ta.setPreference(pref)
        }
        syncThemeSegmentUI()
        const label = seg === 'auto' ? 'Auto (system)' : seg === 'light' ? 'Light' : 'Dark'
        paintSectionStatus('st_theme', true, 'Appearance / theme', 'Set to ' + label + ' — local + AppSettings sync.')
      })
    })
    const ta2 = window.PieTheme || window.ArthaTheme
    if (ta2 && typeof ta2.reconcileWithServer === 'function') {
      ta2.reconcileWithServer()
      setTimeout(syncThemeSegmentUI, 400)
    }
  }

  // ---------- V5.2 App preferences ----------
  async function loadAppPreferences() {
    try {
      const [res, overviewRes] = await Promise.all([
        fetchJsonTimeout('/api/app-settings', { method: 'GET', cache: 'no-store' }, 25_000),
        fetch('/api/overview', { method: 'GET', cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null)
      ])
      const st = res?.data?.settings || {}
      const ccy = String(st.displayCurrency || 'CZK').toUpperCase()
      const elC = document.getElementById('as_display_ccy')
      if (elC) elC.value = ccy
      const risk =
        String(res?.data?.effectiveRiskProfile || '').toUpperCase() ||
        String(overviewRes?.data?.mergedRiskProfile || '').toUpperCase() ||
        String(overviewRes?.data?.settings?.riskProfile || '').toUpperCase() ||
        String(overviewRes?.data?.profile?.riskProfile || '').toUpperCase() ||
        'MODERATE'
      const elR = document.getElementById('as_risk')
      if (elR) elR.value = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].includes(risk) ? risk : 'MODERATE'
      const elMin = document.getElementById('min-sell-threshold')
      if (elMin) {
        const mv = st.minSellThresholdCzk != null ? Number(st.minSellThresholdCzk) : 1000
        elMin.value = Number.isFinite(mv) ? String(mv) : '1000'
      }
      const dbg = document.getElementById('as_ai_debug')
      if (dbg) dbg.checked = !!st.aiDebugLogging
      const dauth = document.getElementById('as_dashboard_auth')
      if (dauth) dauth.checked = !!st.dashboardAuthEnabled
      const bootInp = document.getElementById('as_bootstrap_phrase')
      if (bootInp) bootInp.value = ''
      const bootHint = document.getElementById('as_bootstrap_hint')
      if (bootHint) {
        bootHint.textContent = st.hasDashboardBootstrapKey
          ? 'A bootstrap phrase is saved (hashed). Enter a new phrase here only to replace it.'
          : 'No phrase saved yet — set one here (recommended) or use PIE_AUTH_BOOTSTRAP_KEY in .env.'
      }
      // V6 customization fields
      const tw = document.getElementById('as_target_wealth')
      if (tw) tw.value = st.targetWealthCzk != null ? Number(st.targetWealthCzk) : ''
      const td = document.getElementById('as_target_date')
      if (td) td.value = st.targetDate ? String(st.targetDate).slice(0, 10) : ''
      const tz = document.getElementById('as_timezone')
      if (tz && st.timezone) tz.value = String(st.timezone)
      const ac = document.getElementById('as_accent')
      if (ac) ac.value = String(st.accentColor || 'BLUE').toUpperCase()
      const cc = document.getElementById('as_categories')
      if (cc) {
        const cats = Array.isArray(st.customCategories) ? st.customCategories : []
        cc.value = cats.join(', ')
      }
    } catch {
      /* */
    }
  }

  // ---------- V5.2 Integrations (non-AI) ----------
  let providerListCache = []
  let aiSyncedActiveKey = null

  async function loadNonAiIntegrations() {
    const grid = document.getElementById('integrations-grid')
    if (!grid) return
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-message">Loading integrations…</div></div>`
    let oauthMeta = { configured: false, redirectUri: null, publicUrl: null, missing: [] }
    try {
      const om = await fetchJsonTimeout('/api/oauth/google/mail/meta', { method: 'GET', cache: 'no-store' }, 12_000)
      if (om?.success && om.data) oauthMeta = om.data
    } catch {
      /* optional */
    }
    try {
      const res = await fetchJsonTimeout('/api/integrations', { method: 'GET', cache: 'no-store' }, 25_000)
      if (!res?.success) {
        grid.innerHTML = `<div class="callout callout-warning">${escapeHtml(res?.error || 'Failed to load')}</div>`
        return
      }
      const list = res?.data?.providers || []
      providerListCache = list
      const byKey = {}
      for (const p of list) byKey[p.key] = p

      grid.innerHTML = NON_AI_INTEGRATION_ORDER.map((key) => {
        const p = byKey[key] || {
          key,
          label: INTEG_LABELS[key] || key,
          category: categoryForKey(key),
          enabled: false,
          isDefault: false,
          config: {},
          secrets: {}
        }
        const cfg = p.config && typeof p.config === 'object' ? p.config : {}
        const sec = p.secrets && typeof p.secrets === 'object' ? p.secrets : {}
        const s = slug(key)
        let bodyHtml = ''
        if (key === 'comms.smtp') {
          const oauthConnected =
            String(cfg.authMode || '') === 'oauth2' || !!(sec.refreshToken && String(sec.refreshToken).startsWith('•'))
          const miss = (oauthMeta.missing || []).length
            ? `<p class="form-field-help ai-status-fail" style="padding:0;margin:var(--space-2) 0 0">Still needed: ${escapeHtml((oauthMeta.missing || []).join(' · '))}</p>`
            : ''
          const oauthRedirect = oauthMeta.redirectUri ? escapeHtml(String(oauthMeta.redirectUri)) : '—'
          const oauthStartHref = '/api/oauth/google/mail/start?r=' + encodeURIComponent(window.location.pathname || '/settings')
          const oauthIdVal = escapeHtml(integVal(cfg.oauthClientId))
          const statusClass = oauthConnected ? 'ai-status-ok' : 'ai-status-muted'
          const statusLabel = oauthConnected ? 'Account connected' : 'Not connected'
          bodyHtml = `
          <div class="gmail-oauth2-card" style="margin-bottom:var(--space-4);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:var(--space-3);margin-bottom:var(--space-3)">
              <div>
                <h4 style="margin:0;font-size:var(--text-md);font-weight:600">Gmail OAuth2 API</h4>
                <p class="form-field-help" style="margin:var(--space-1) 0 0">Same flow as n8n: paste redirect URL in Google Cloud, Client ID + Secret here, then Sign in.</p>
              </div>
              <span class="ai-status-panel ${statusClass}" style="display:inline-block;padding:var(--space-1) var(--space-2);font-size:var(--text-sm);margin:0">${escapeHtml(statusLabel)}</span>
            </div>
            <p class="form-field-help" style="margin-top:0">Sends over <strong>HTTPS</strong> (Gmail API) when linked — avoids blocked SMTP ports.</p>
            ${miss}
            <div class="form-field" style="margin-top:var(--space-3)">
              <label class="form-field-label" for="integ-${s}-oauth-redirect">OAuth redirect URL</label>
              <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center">
                <input id="integ-${s}-oauth-redirect" type="text" readonly class="form-field-input" style="flex:1;min-width:12rem" value="${oauthRedirect}" />
                <button type="button" class="btn btn-ghost btn-sm" id="integ-${s}-oauth-copy">Copy</button>
              </div>
              <p class="form-field-help">Google Cloud → Credentials → your <strong>Web</strong> OAuth client → Authorized redirect URIs → add exactly this URL.</p>
            </div>
            <div class="form-row" style="margin-top:var(--space-3)">
              <div class="form-field" style="flex:1;min-width:14rem">
                <label class="form-field-label" for="integ-${s}-oauth-client-id">Client ID</label>
                <input id="integ-${s}-oauth-client-id" type="text" class="form-field-input" value="${oauthIdVal}" placeholder="xxx.apps.googleusercontent.com" autocomplete="off" />
              </div>
              <div class="form-field" style="flex:1;min-width:14rem">
                <label class="form-field-label" for="integ-${s}-oauth-client-secret">Client Secret</label>
                <input id="integ-${s}-oauth-client-secret" type="password" class="form-field-input" placeholder="${sec.oauthClientSecret ? '•••• (saved — paste to replace)' : ''}" autocomplete="off" />
              </div>
            </div>
            <p style="margin-top:var(--space-3)">
              ${oauthMeta.configured ? `<a class="btn btn-primary btn-sm" href="${oauthStartHref}">Sign in with Google</a>` : '<span class="form-field-help">Save Client ID + Secret above, then Sign in appears.</span>'}
            </p>
          </div>
          <div class="form-row">
            <div class="form-field"><label class="form-field-label" for="integ-${s}-host">Host</label><input id="integ-${s}-host" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.host))}" placeholder="smtp.gmail.com" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-port">Port</label><input id="integ-${s}-port" type="number" class="form-field-input" value="${escapeHtml(integVal(cfg.port || 587))}" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-user">User</label><input id="integ-${s}-user" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.user))}" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-from">From address</label><input id="integ-${s}-from" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.fromAddress))}" /></div>
          </div>
          <div class="form-field">
            <label class="form-field-label" for="integ-${s}-secret">Password / app password</label>
            <input id="integ-${s}-secret" type="password" class="form-field-input" placeholder="${sec.password ? '•••• (saved — paste to replace)' : ''}" autocomplete="off" />
          </div>
          <div class="toggle-row" style="margin-top: var(--space-3)">
            <div class="toggle-row-text"><div class="toggle-row-title">Strict TLS</div><div class="toggle-row-desc">Maps to <code>rejectUnauthorized</code> (off only for broken certs). Used for SMTP path only.</div></div>
            <label class="toggle"><input type="checkbox" id="integ-${s}-tls" ${cfg.rejectUnauthorized === false ? '' : 'checked'} /><span class="toggle-slider"></span></label>
          </div>
          <p class="form-field-help" style="margin-top:var(--space-3)"><strong>Test</strong> checks Gmail OAuth (HTTPS) when linked; otherwise SMTP verify only (no email). For <strong>Gmail SMTP</strong>, use host <code>smtp.gmail.com</code> — tries <strong>587</strong> then <strong>465</strong>. App password: 16 characters, <strong>no spaces</strong>. Other providers: <strong>587</strong> or <strong>465</strong>. Real send: <strong>Notifications → Send test email</strong>.</p>`
        } else if (key === 'comms.telegram') {
          bodyHtml = `
          <p class="form-field-help" style="margin-top:0;margin-bottom:var(--space-3)"><strong>Setup:</strong> (1) In Telegram, open <strong>@BotFather</strong> → <code>/newbot</code> → copy the <strong>HTTP API token</strong> below. (2) Open <strong>your</strong> bot’s chat (not BotFather) and send <code>/start</code> — PIE saves your <strong>numeric</strong> chat id. Do <strong>not</strong> put the bot’s own @username here (e.g. not <code>@YourBotName</code>); that causes HTTP 400. (3) Turn <strong>On</strong>, <strong>Save</strong>, then <strong>Test</strong>.</p>
          <div class="form-row">
            <div class="form-field"><label class="form-field-label" for="integ-${s}-chat">Chat ID</label><input id="integ-${s}-chat" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.chatId))}" placeholder="e.g. 123456789 (digits)" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-secret">Bot token</label><input id="integ-${s}-secret" type="password" class="form-field-input" placeholder="${sec.botToken ? '•••• (saved — paste to replace)' : ''}" autocomplete="off" /></div>
          </div>`
        } else if (key === 'comms.imap') {
          bodyHtml = `
          <div class="form-row">
            <div class="form-field"><label class="form-field-label" for="integ-${s}-host">Host</label><input id="integ-${s}-host" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.host))}" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-port">Port</label><input id="integ-${s}-port" type="number" class="form-field-input" value="${escapeHtml(integVal(cfg.port || 993))}" /></div>
            <div class="form-field"><label class="form-field-label" for="integ-${s}-user">User</label><input id="integ-${s}-user" type="text" class="form-field-input" value="${escapeHtml(integVal(cfg.user))}" /></div>
          </div>
          <div class="form-field"><label class="form-field-label" for="integ-${s}-secret">Password</label><input id="integ-${s}-secret" type="password" class="form-field-input" placeholder="${sec.password ? '•••• (saved)' : ''}" /></div>`
        } else if (key === 'fx.exchangerate-api') {
          bodyHtml = `
          <div class="form-field">
            <label class="form-field-label" for="integ-${s}-secret">API key</label>
            <input id="integ-${s}-secret" type="password" class="form-field-input" placeholder="${sec.apiKey ? '•••• (saved — paste to replace)' : ''}" />
          </div>`
        }

        return `
        <div class="integration-block" data-provider-key="${escapeHtml(key)}">
          <div class="integration-block-head">
            <div>
              <h3 class="integration-title">${escapeHtml(p.label || key)} <code>${escapeHtml(key)}</code></h3>
              <p class="form-field-help">${escapeHtml(String(p.category || ''))}</p>
            </div>
            <div class="integration-actions" style="flex-wrap:wrap;gap:var(--space-2)">
              <label class="toggle" style="margin-right: var(--space-2)"><input type="checkbox" class="integ-enabled" ${p.enabled ? 'checked' : ''} /><span class="toggle-slider"></span><span style="margin-left:6px;font-size:var(--text-sm)">On</span></label>
              <button type="button" class="btn btn-ghost btn-sm integ-test" data-integ-key="${escapeHtml(key)}">Test</button>
              <button type="button" class="btn btn-primary btn-sm integ-save" data-integ-key="${escapeHtml(key)}">Save</button>
              <button type="button" class="btn btn-ghost btn-sm integ-clear" data-integ-key="${escapeHtml(key)}">Disable &amp; clear…</button>
              <button type="button" class="btn btn-ghost btn-sm integ-remove" data-integ-key="${escapeHtml(key)}">Remove row…</button>
            </div>
          </div>
          ${bodyHtml}
          <p class="form-field-help" style="margin-top:var(--space-2)">Secrets: leave blank to keep the saved value; paste only when rotating credentials.</p>
          <details class="integ-history-details" data-integ-key="${escapeHtml(key)}" style="margin-top:var(--space-2)">
            <summary class="form-field-help" style="cursor:pointer">Recent status / test runs</summary>
            <div class="integ-history-body" data-integ-history-body="${escapeHtml(key)}" style="margin-top:var(--space-2);font-size:var(--text-sm)"></div>
          </details>
          <div class="ai-status-panel settings-integ-status ai-status-muted" data-integ-panel="${escapeHtml(key)}" style="display:none;margin-top:var(--space-3)" aria-live="polite"></div>
        </div>`
      }).join('')

      grid.querySelectorAll('.integ-test').forEach((btn) => {
        btn.addEventListener('click', () => runIntegrationTest(btn.getAttribute('data-integ-key')))
      })
      grid.querySelectorAll('.integ-save').forEach((btn) => {
        btn.addEventListener('click', () => saveIntegrationRow(btn.getAttribute('data-integ-key')))
      })
      grid.querySelectorAll('.integ-clear').forEach((btn) => {
        btn.addEventListener('click', () => deleteIntegrationRow(btn.getAttribute('data-integ-key'), false))
      })
      grid.querySelectorAll('.integ-remove').forEach((btn) => {
        btn.addEventListener('click', () => deleteIntegrationRow(btn.getAttribute('data-integ-key'), true))
      })
      const oauthCopy = document.getElementById('integ-comms-smtp-oauth-copy')
      if (oauthCopy) {
        oauthCopy.addEventListener('click', async () => {
          const inp = document.getElementById('integ-comms-smtp-oauth-redirect')
          const v = inp && 'value' in inp ? String(inp.value || '') : ''
          try {
            await navigator.clipboard.writeText(v)
            oauthCopy.textContent = 'Copied'
            setTimeout(() => {
              oauthCopy.textContent = 'Copy'
            }, 2000)
          } catch {
            window.prompt('Copy this redirect URL:', v)
          }
        })
      }
      grid.querySelectorAll('details.integ-history-details').forEach((det) => {
        det.addEventListener('toggle', async function onIntegHistoryToggle() {
          if (!det.open) return
          const key = det.getAttribute('data-integ-key')
          const body = det.querySelector('[data-integ-history-body]')
          if (!body || !key) return
          body.textContent = 'Loading…'
          try {
            const j = await fetchJsonTimeout(
              '/api/integrations/' + encodeURIComponent(key) + '/status?n=25',
              { method: 'GET', cache: 'no-store' },
              20_000
            )
            const rows = Array.isArray(j?.data?.status) ? j.data.status : []
            if (rows.length === 0) {
              body.innerHTML =
                '<p class="form-field-help">No history yet. Use <strong>Test</strong> or save to record runs.</p>'
              return
            }
            body.innerHTML =
              '<ul style="margin:0;padding-left:1.2rem;max-height:14rem;overflow:auto">' +
              rows
                .map((row) => {
                  const st = escapeHtml(row.status || '')
                  const msg = escapeHtml((row.message || '').slice(0, 200))
                  const when = row.testedAt ? escapeHtml(new Date(row.testedAt).toLocaleString()) : '—'
                  return `<li style="margin-bottom:6px"><strong>${st}</strong> · ${when}<br/><span style="color:var(--color-text-secondary)">${msg}</span></li>`
                })
                .join('') +
              '</ul>'
          } catch (e) {
            body.textContent = 'Could not load: ' + String(e)
          }
        })
      })
    } catch (e) {
      grid.innerHTML = `<div class="callout callout-warning">Could not load integrations: ${escapeHtml(String(e))}</div>`
    }
  }

  function providerByKeyFromCache() {
    const m = {}
    for (const p of providerListCache) m[p.key] = p
    return m
  }

  function updateAiApplyVisibility() {
    const sel = document.getElementById('ai_active_provider')
    const apply = document.getElementById('ai_apply_active')
    if (!sel || !apply) return
    const staged = sel.value || null
    const synced = aiSyncedActiveKey || null
    apply.style.display = staged !== synced ? 'inline-block' : 'none'
  }

  function hasSavedAiApiKey(sec) {
    return !!(sec && sec.apiKey != null && String(sec.apiKey).trim() !== '')
  }

  function syncAiProviderCardHighlight(activeKey) {
    document.querySelectorAll('.ai-provider-card').forEach((el) => {
      const k = el.getAttribute('data-ai-provider')
      el.classList.toggle('is-active-provider', !!activeKey && k === activeKey)
    })
  }

  function renderAiProviderCards() {
    const mount = document.getElementById('ai_provider_cards')
    if (!mount) return
    const by = providerByKeyFromCache()
    mount.innerHTML = AI_INTEGRATION_KEYS.map((providerKey) => {
      const p = by[providerKey] || {
        key: providerKey,
        label: INTEG_LABELS[providerKey] || providerKey,
        config: {},
        secrets: {},
        enabled: false
      }
      const cfg = p.config && typeof p.config === 'object' ? p.config : {}
      const sec = p.secrets && typeof p.secrets === 'object' ? p.secrets : {}
      const currentModel = integVal(cfg.model)
      const presets = AI_MODEL_PRESETS[providerKey] || []
      let modelVal = currentModel
      if (modelVal && !presets.includes(modelVal)) modelVal = presets[0] || modelVal
      const presetOpts = presets
        .map((m) => `<option value="${escapeHtml(m)}" ${m === modelVal ? 'selected' : ''}>${escapeHtml(m)}</option>`)
        .join('')
      const s = slug(providerKey)
      const configured = hasSavedAiApiKey(sec)
      const canTest = configured || !!p.enabled
      const ph = configured ? '•••• (saved — paste to replace)' : 'Paste API key'
      return `
      <div class="ai-provider-card" data-ai-provider="${escapeHtml(providerKey)}">
        <div class="ai-provider-card-head">
          <h3 class="ai-provider-card-title">${escapeHtml(p.label || INTEG_LABELS[providerKey] || providerKey)}</h3>
          <span class="ai-provider-badge ai-provider-badge--muted" data-ai-card-badge="${escapeHtml(providerKey)}">UNCONFIGURED</span>
        </div>
        <div class="form-field">
          <label class="form-field-label" for="ai-card-model-${s}">Model</label>
          <select id="ai-card-model-${s}" class="form-field-select">
            ${presetOpts}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field-label" for="ai-card-secret-${s}">API key</label>
          <input id="ai-card-secret-${s}" type="password" class="form-field-input" placeholder="${ph}" autocomplete="off" />
        </div>
        <p class="form-field-help" data-ai-card-tested="${escapeHtml(providerKey)}" style="margin:0">Last tested: —</p>
        <div class="form-actions" style="margin-top:var(--space-3);display:flex;flex-wrap:wrap;gap:var(--space-2)">
          <button type="button" class="btn btn-primary btn-sm" data-ai-action="save" data-ai-key="${escapeHtml(providerKey)}">Save</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ai-action="test" data-ai-key="${escapeHtml(
            providerKey
          )}" ${canTest ? '' : 'disabled'} data-ai-test-btn="${escapeHtml(providerKey)}">Test connection</button>
        </div>
      </div>`
    }).join('')
  }

  function readAiCardModel(providerKey) {
    const s = slug(providerKey)
    const sel = document.getElementById('ai-card-model-' + s)
    return sel?.value?.trim() || ''
  }

  async function saveAiCard(providerKey) {
    if (!providerKey) return
    const s = slug(providerKey)
    const config = {}
    const m = readAiCardModel(providerKey)
    if (m) config.model = m
    const secrets = {}
    const apiKey = readSecretInput('ai-card-secret-' + s)
    if (apiKey !== undefined) secrets.apiKey = apiKey
    const body = { enabled: true, config }
    if (Object.keys(secrets).length) body.secrets = secrets
    const res = await fetch('/api/integrations/' + encodeURIComponent(providerKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => r.json())
    if (!res.success) {
      window.alert(res.error || 'Save failed')
      paintSectionStatus('st_ai_apply', false, 'AI provider', res.error || 'Integration save failed')
      return
    }
    const appRes = await fetch('/api/app-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultAiProviderKey: providerKey })
    }).then((r) => r.json())
    if (!appRes.success) {
      window.alert(appRes.error || 'Could not set active provider')
      paintSectionStatus('st_ai_apply', false, 'AI provider', appRes.error || 'AppSettings update failed')
      return
    }
    paintSectionStatus('st_ai_apply', true, 'AI provider', 'Saved configuration and set active provider.')
    aiSyncedActiveKey = providerKey
    const sel = document.getElementById('ai_active_provider')
    if (sel) sel.value = providerKey
    updateAiApplyVisibility()
    await loadNonAiIntegrations()
    await loadAiProviderBlock()
  }

  async function refreshAiCardRowStatus(providerKey, interimMsg) {
    const badge = document.querySelector('[data-ai-card-badge="' + providerKey + '"]')
    const tested = document.querySelector('[data-ai-card-tested="' + providerKey + '"]')
    const testBtn = document.querySelector('[data-ai-test-btn="' + providerKey + '"]')
    if (!badge || !tested) return
    const by = providerByKeyFromCache()
    const p = by[providerKey]
    const configured = p && hasSavedAiApiKey(p.secrets)
    if (testBtn) testBtn.disabled = !(configured || p?.enabled)
    if (interimMsg) {
      badge.textContent = interimMsg
      badge.className = 'ai-provider-badge ai-provider-badge--muted'
      return
    }
    try {
      const j = await fetchJsonTimeout(
        '/api/integrations/' + encodeURIComponent(providerKey) + '/status?n=1',
        { method: 'GET', cache: 'no-store' },
        15_000
      )
      const row = (j?.data?.status && j.data.status[0]) || null
      if (!row) {
        badge.textContent = configured ? 'CONNECTED' : 'UNCONFIGURED'
        badge.className =
          'ai-provider-badge ' + (configured ? 'ai-provider-badge--ok' : 'ai-provider-badge--muted')
        tested.textContent = 'Last tested: —'
        return
      }
      const ok = row.status === 'OK'
      badge.textContent = ok ? 'CONNECTED' : row.status === 'WARN' ? 'WARN' : 'ERROR'
      badge.className =
        'ai-provider-badge ' + (ok ? 'ai-provider-badge--ok' : row.status === 'WARN' ? 'ai-provider-badge--warn' : 'ai-provider-badge--fail')
      const when = row.testedAt ? new Date(row.testedAt).toLocaleString() : '—'
      tested.textContent = 'Last tested: ' + when
    } catch {
      badge.textContent = 'ERROR'
      badge.className = 'ai-provider-badge ai-provider-badge--fail'
      tested.textContent = 'Last tested: —'
    }
  }

  async function runAiCardTest(providerKey) {
    if (!providerKey) return
    await refreshAiCardRowStatus(providerKey, 'Testing…')
    try {
      await fetch('/api/integrations/' + encodeURIComponent(providerKey) + '/test', { method: 'POST' }).then((r) =>
        r.json()
      )
    } catch {
      /* refresh below */
    }
    await refreshAiCardRowStatus(providerKey, null)
  }

  function updateAiActiveBanner(activeKey) {
    const el = document.getElementById('ai_active_banner')
    if (!el) return
    if (!activeKey) {
      el.textContent = 'Active: — (none). Choose a provider and Apply selection, or Save on a card to activate it.'
      return
    }
    const by = providerByKeyFromCache()
    const row = by[activeKey]
    const lab = (row && row.label) || INTEG_LABELS[activeKey] || activeKey
    const mod = readAiCardModel(activeKey) || integVal(row?.config?.model) || '—'
    el.textContent = 'Active: ' + lab + ' (' + mod + ')'
  }

  async function applyAiSelection() {
    const sel = document.getElementById('ai_active_provider')
    if (!sel) return
    const v = sel.value || null
    try {
      const res = await fetchJsonTimeout('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAiProviderKey: v })
      })
      if (!res.success) {
        window.alert(res.error || 'Apply failed')
        paintSectionStatus('st_ai_apply', false, 'Active AI provider', res.error || 'Apply failed')
        return
      }
      paintSectionStatus(
        'st_ai_apply',
        true,
        'Active AI provider',
        v ? 'Now using ' + v + ' for Ask PIE.' : 'None — AI integrations disabled until you pick a provider.'
      )
      aiSyncedActiveKey = v
      updateAiApplyVisibility()
      await loadNonAiIntegrations()
      await loadAiProviderBlock()
    } catch (e) {
      window.alert(String(e))
      paintSectionStatus('st_ai_apply', false, 'Active AI provider', String(e))
    }
  }

  async function loadAiProviderBlock() {
    const warn = document.getElementById('ai_unconfigured_warn')
    const sel = document.getElementById('ai_active_provider')
    const cards = document.getElementById('ai_provider_cards')
    if (!sel || !cards) return
    try {
      const [appRes, intRes] = await Promise.all([
        fetchJsonTimeout('/api/app-settings', { method: 'GET', cache: 'no-store' }, 25_000),
        fetchJsonTimeout('/api/integrations', { method: 'GET', cache: 'no-store' }, 25_000)
      ])
      const st = appRes?.data?.settings || {}
      const list = intRes?.data?.providers || []
      providerListCache = list
      const dk = st.defaultAiProviderKey || ''
      aiSyncedActiveKey = dk || null
      sel.value = AI_INTEGRATION_KEYS.includes(dk) ? dk : ''
      updateAiApplyVisibility()
      renderAiProviderCards()
      const active = sel.value || null
      syncAiProviderCardHighlight(active)
      updateAiActiveBanner(active)
      if (warn) {
        const by = providerByKeyFromCache()
        const row = active ? by[active] : null
        const hasKey = row && hasSavedAiApiKey(row.secrets)
        if (active && !hasKey) {
          warn.style.display = 'block'
          warn.textContent = 'Provider not configured: add an API key and Save, then Test connection.'
        } else {
          warn.style.display = 'none'
          warn.textContent = ''
        }
      }
      await Promise.all(AI_INTEGRATION_KEYS.map((k) => refreshAiCardRowStatus(k, null)))
      const statusEl = document.getElementById('ai_status_mount')
      if (statusEl) {
        statusEl.className = 'ai-status-panel ai-status-muted'
        statusEl.innerHTML =
          '<div class="form-field-help" style="margin:0">Each card shows connection status and last test time.</div>'
      }
    } catch (e) {
      cards.innerHTML = `<div class="callout callout-warning">${escapeHtml(String(e))}</div>`
    }
  }

  async function loadIntegrations() {
    await loadNonAiIntegrations()
    await loadAiProviderBlock()
  }

  async function saveIntegrationRow(key) {
    if (!key) return
    const s = slug(key)
    const block = document.querySelector('.integration-block[data-provider-key="' + key + '"]')
    const enabled = block?.querySelector('.integ-enabled')?.checked ?? false
    const config = {}
    const secrets = {}
    if (key === 'comms.smtp') {
      const host = document.getElementById('integ-' + s + '-host')?.value?.trim()
      const port = Number(document.getElementById('integ-' + s + '-port')?.value)
      const user = document.getElementById('integ-' + s + '-user')?.value?.trim()
      const fromAddr = document.getElementById('integ-' + s + '-from')?.value?.trim()
      const oauthClientId = document.getElementById('integ-' + s + '-oauth-client-id')?.value?.trim()
      if (host) config.host = host
      if (port) config.port = port
      if (user) config.user = user
      if (fromAddr) config.fromAddress = fromAddr
      if (oauthClientId) config.oauthClientId = oauthClientId
      config.rejectUnauthorized = document.getElementById('integ-' + s + '-tls')?.checked ?? true
      const pwd = readSecretInput('integ-' + s + '-secret')
      if (pwd !== undefined) secrets.password = pwd
      const oauthSec = readSecretInput('integ-' + s + '-oauth-client-secret')
      if (oauthSec !== undefined) secrets.oauthClientSecret = oauthSec
    } else if (key === 'comms.telegram') {
      const chatId = document.getElementById('integ-' + s + '-chat')?.value?.trim()
      if (chatId) config.chatId = chatId
      const tok = readSecretInput('integ-' + s + '-secret')
      if (tok !== undefined) secrets.botToken = tok
    } else if (key === 'comms.imap') {
      const host = document.getElementById('integ-' + s + '-host')?.value?.trim()
      const port = Number(document.getElementById('integ-' + s + '-port')?.value)
      const user = document.getElementById('integ-' + s + '-user')?.value?.trim()
      if (host) config.host = host
      if (port) config.port = port
      if (user) config.user = user
      const pwd = readSecretInput('integ-' + s + '-secret')
      if (pwd !== undefined) secrets.password = pwd
    } else if (key === 'fx.exchangerate-api') {
      const k = readSecretInput('integ-' + s + '-secret')
      if (k !== undefined) secrets.apiKey = k
    }

    const body = { enabled, config }
    if (Object.keys(secrets).length) body.secrets = secrets

    const res = await fetch('/api/integrations/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => r.json())
    if (!res.success) {
      window.alert(res.error || 'Save failed')
      paintIntegrationBlockStatus(key, false, 'save', res.error || 'Save failed', null)
      return
    }
    await loadIntegrations()
    paintIntegrationBlockStatus(key, true, 'save', 'Stored in IntegrationProvider (encrypted secrets).', null)
  }

  async function deleteIntegrationRow(key, hard) {
    if (!key) return
    const softMsg =
      'Disable this integration and wipe saved secrets? You can turn it on again and re-enter credentials later.'
    const hardMsg =
      'Permanently delete this IntegrationProvider row from the database? Only use if you understand rows may be re-seeded by migrations or env bootstrap.'
    if (!window.confirm(hard ? hardMsg : softMsg)) return
    try {
      const res = await fetch('/api/integrations/' + encodeURIComponent(key) + (hard ? '?hard=1' : ''), {
        method: 'DELETE'
      })
      const j = await res.json().catch(() => ({}))
      if (!j?.success) {
        window.alert(j?.error || 'Request failed')
        paintIntegrationBlockStatus(key, false, 'clear', j?.error || 'Delete failed', null)
        return
      }
      await loadIntegrations()
      paintIntegrationBlockStatus(key, true, 'clear', hard ? 'Row removed.' : 'Disabled and secrets cleared.', null)
    } catch (e) {
      window.alert(String(e))
    }
  }

  async function runIntegrationTest(key) {
    if (!key) return
    const panel = document.querySelector('[data-integ-panel="' + key + '"]')
    if (panel) {
      panel.style.display = 'block'
      panel.className = 'ai-status-panel settings-integ-status ai-status-muted'
      panel.innerHTML = '<div><strong>Status:</strong> … Testing</div>'
    }
    try {
      const res = await fetch('/api/integrations/' + encodeURIComponent(key) + '/test', { method: 'POST' })
      const j = await res.json()
      const d = j?.data
      const ok = !!(j?.success && d && (d.status === 'OK' || d.status === 'WARN'))
      const msg = j?.success && d ? d.message : j?.error || 'Request failed'
      const lat = d && d.latencyMs != null ? d.latencyMs : null
      paintIntegrationBlockStatus(key, ok, 'test', msg, lat)
    } catch (e) {
      paintIntegrationBlockStatus(key, false, 'test', String(e), null)
    }
  }

  // ---------- Settings load / save plumbing ----------
  let currentSettings = {}

  async function loadSettings() {
    try {
      const res = await fetchJsonTimeout('/api/settings', { method: 'GET', cache: 'no-store' }, 25_000)
      currentSettings = res?.data?.settings || {}
      const note = document.getElementById('secrets-at-rest-note')
      const si = res?.data?.secretsInfo
      if (note && si) {
        note.textContent = `${si.message} Key file: ${si.keyfilePath}`
      }
    } catch {
      /* */
    }

    const set = (id, v) => {
      const el = document.getElementById(id)
      if (el == null || v == null) return
      if (el.type === 'checkbox') el.checked = !!v
      else el.value = v
    }

    set('t_eq', currentSettings.targetEquityPct)
    set('t_bd', currentSettings.targetBondsPct)
    set('t_cs', currentSettings.targetCashPct)
    set('tax_window_buy', currentSettings.taxFreeWindowAllowsBuy)
    updateTargetsSum()

    set('i_auto', currentSettings.autoIngestEmails)
    set('i_host', currentSettings.imapHost)
    set('i_port', currentSettings.imapPort)
    set('i_user', currentSettings.imapUser)

    set('n_email', currentSettings.alertEmail)
    set('n_tg', currentSettings.telegramChatId)
    set('n_monthly', currentSettings.monthlyLetterEnabled)
    set('n_alerts', currentSettings.alertsEnabled)

    set('d_enabled', currentSettings.demoModeEnabled)
    set('d_persona', currentSettings.demoPersona)
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
    const te = document.getElementById('t_eq')
    const tb = document.getElementById('t_bd')
    const tc = document.getElementById('t_cs')
    const el = document.getElementById('targets-sum')
    if (!te || !tb || !tc || !el) return
    const eq = Number(te.value) || 0
    const bd = Number(tb.value) || 0
    const cs = Number(tc.value) || 0
    const sum = eq + bd + cs
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
    let loadError = null
    try {
      const res = await fetchJsonTimeout(
        '/api/health',
        { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
        25_000
      )
      if (res && res.success === false) {
        loadError = String(res.error || res.message || 'Health check refused')
      } else {
      data = res?.data || {}
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e)
    }

    const checks = Array.isArray(data.checks) ? data.checks : []
    const passing = checks.filter((c) => c.status === 'PASS').length
    const hp = document.getElementById('h-passing')
    const ht = document.getElementById('h-total')
    const htr = document.getElementById('h-trust')
    if (hp) hp.textContent = String(passing)
    if (ht) ht.textContent = String(checks.length)
    if (htr) htr.textContent = data.trustScore != null ? Number(data.trustScore) + '%' : '—'

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
    if (!grid) return
    if (checks.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-message">No health checks loaded.</div></div>`
      const stEmpty = document.getElementById('st_health')
      if (stEmpty) {
        stEmpty.style.display = 'block'
        stEmpty.className = 'ai-status-panel settings-section-status ai-status-muted'
        const detail =
          loadError ||
          'No rows returned from /api/health (empty response or checks missing).'
        stEmpty.innerHTML =
          '<div><strong>Status:</strong> ⚠️ No checks</div><div><strong>Summary:</strong> System health</div><div><strong>Time:</strong> ' +
          escapeHtml(formatSettingsTime()) +
          '</div><div><strong>Detail:</strong> ' +
          escapeHtml(detail) +
          '</div>'
      }
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

    const stH = document.getElementById('st_health')
    if (stH) {
      stH.style.display = 'block'
      const allPass = passing === checks.length
      stH.className =
        'ai-status-panel settings-section-status ' + (allPass ? 'ai-status-ok' : 'ai-status-muted')
      const trust = data.trustScore != null ? Number(data.trustScore) + '%' : '—'
      stH.innerHTML =
        '<div><strong>Status:</strong> ' +
        (allPass ? '✅ All checks pass' : '⚠️ Review warnings/failures') +
        '</div>' +
        '<div><strong>Summary:</strong> ' +
        escapeHtml(String(passing)) +
        ' / ' +
        escapeHtml(String(checks.length)) +
        ' checks · trust ' +
        escapeHtml(trust) +
        '</div>' +
        '<div><strong>Time:</strong> ' +
        escapeHtml(formatSettingsTime()) +
        '</div>'
    }
  }

  async function loadIntelligenceSummary() {
    try {
      const [stratRes, ceRes] = await Promise.all([
        fetch('/api/strategies').then((r) => r.json()),
        fetch('/api/capital-efficiency').then((r) => r.json())
      ])
      const strategies = stratRes.data ?? []
      const approved = strategies.filter((s) => ['APPROVED', 'MONITORING'].includes(s.status)).length
      const proposed = strategies.filter((s) => s.status === 'PROPOSED').length
      const sleeping = ceRes.data?.totalSleepingCzk ?? 0
      const loss = ceRes.data?.totalAnnualRealLossCzk ?? 0
      const elA = document.getElementById('isw-approved')
      const elP = document.getElementById('isw-proposed')
      const elS = document.getElementById('isw-sleeping')
      const elL = document.getElementById('isw-loss')
      if (elA) elA.textContent = String(approved)
      if (elP) elP.textContent = String(proposed)
      if (elS) {
        elS.textContent =
          sleeping > 0 ? sleeping.toLocaleString('cs-CZ') + ' Kč' : 'None detected'
      }
      if (elL) {
        elL.textContent = loss > 0 ? '−' + loss.toLocaleString('cs-CZ') + ' Kč/yr' : '—'
      }
    } catch {
      /* informational only */
    }
  }

  // ---------- Wire-up (after DOM; safe if script placement changes) ----------
  function wireSettingsPage() {
    initThemeSegmented()
    void (async function bootSettingsPage() {
      try {
        await loadSettings()
      } catch (e) {
        console.error('[settings] loadSettings', e)
      }
      await Promise.allSettled([loadAppPreferences(), loadIntegrations(), loadHealth()])
      await loadIntelligenceSummary()
      consumeGmailOAuthFromUrl()
    })()

  ;['t_eq', 't_bd', 't_cs'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateTargetsSum)
    })

    document.getElementById('save-app-prefs')?.addEventListener('click', () =>
    withButton('save-app-prefs', 'Save', async () => {
      const bootEl = document.getElementById('as_bootstrap_phrase')
      const bootVal = bootEl ? String(bootEl.value || '').trim() : ''
      const twRaw = document.getElementById('as_target_wealth')?.value
      const tdRaw = document.getElementById('as_target_date')?.value
      const tzRaw = document.getElementById('as_timezone')?.value
      const acRaw = document.getElementById('as_accent')?.value
      const ccRaw = document.getElementById('as_categories')?.value || ''
      const cats = ccRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const minSellRaw = document.getElementById('min-sell-threshold')?.value
      const body = {
        displayCurrency: document.getElementById('as_display_ccy').value,
        riskProfile: document.getElementById('as_risk').value,
        aiDebugLogging: document.getElementById('as_ai_debug').checked,
        dashboardAuthEnabled: !!document.getElementById('as_dashboard_auth')?.checked,
        targetWealthCzk: twRaw === '' || twRaw == null ? null : Number(twRaw),
        targetDate: tdRaw || null,
        timezone: tzRaw || 'Europe/Prague',
        accentColor: (acRaw || 'BLUE').toUpperCase(),
        customCategories: cats,
        minSellThresholdCzk:
          minSellRaw === '' || minSellRaw == null ? undefined : Number(minSellRaw)
      }
      if (window.PieTheme && body.accentColor) {
        try { window.PieTheme.setAccent(body.accentColor) } catch { /* */ }
      }
      if (bootVal.length > 0) body.dashboardBootstrapPhrase = bootVal
      const res = await fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.json())
      if (!res.success) {
        window.alert(res.error || 'Save failed')
        paintSectionStatus('st_app_prefs', false, 'App preferences', res.error || 'Save failed')
      } else {
        await loadAppPreferences()
        paintSectionStatus(
          'st_app_prefs',
          true,
          'App preferences',
          'Display ' +
            body.displayCurrency +
            ', risk ' +
            body.riskProfile +
            ', AI debug ' +
            (body.aiDebugLogging ? 'on' : 'off') +
            ', dashboard login ' +
            (body.dashboardAuthEnabled ? 'on' : 'off') +
            '.'
        )
      }
    })
  )

  document.getElementById('reload-integrations')?.addEventListener('click', async () => {
    const btn = document.getElementById('reload-integrations')
    if (btn) {
      btn.disabled = true
      try {
        await loadIntegrations()
      } finally {
        btn.disabled = false
      }
    }
  })

  document.getElementById('ai_active_provider')?.addEventListener('change', () => {
    updateAiApplyVisibility()
    const v = document.getElementById('ai_active_provider')?.value || null
    syncAiProviderCardHighlight(v)
    updateAiActiveBanner(v)
    const warn = document.getElementById('ai_unconfigured_warn')
    const by = providerByKeyFromCache()
    const row = v ? by[v] : null
    const hasKey = !!(row && row.secrets && row.secrets.apiKey)
    if (warn) {
      if (v && !hasKey) {
        warn.style.display = 'block'
        warn.textContent = 'Provider not configured: add an API key and Save, then Test connection.'
      } else {
        warn.style.display = 'none'
        warn.textContent = ''
      }
    }
  })

  document.getElementById('ai_apply_active')?.addEventListener('click', () => {
    void applyAiSelection()
  })

  document.getElementById('ai_provider_cards')?.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('[data-ai-action]') : null
    if (!btn) return
    const action = btn.getAttribute('data-ai-action')
    const key = btn.getAttribute('data-ai-key')
    if (!key) return
    if (action === 'save') void saveAiCard(key)
    else if (action === 'test') void runAiCardTest(key)
  })

  document.getElementById('save-targets')?.addEventListener('click', () =>
    withButton('save-targets', 'Save', async () => {
      const res = await patch({
        targetEquityPct: Number(document.getElementById('t_eq').value) || 0,
        targetBondsPct: Number(document.getElementById('t_bd').value) || 0,
        targetCashPct: Number(document.getElementById('t_cs').value) || 0,
        taxFreeWindowAllowsBuy: document.getElementById('tax_window_buy').checked
      })
      if (!res.success) {
        window.alert(res.error || 'Save failed')
        paintSectionStatus('st_targets', false, 'Allocation targets', res.error || 'Save failed')
      } else {
        await loadSettings()
        paintSectionStatus('st_targets', true, 'Allocation targets', 'Targets and tax-free window saved to Settings + AppSettings.')
      }
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
      const res = await patch(body)
      document.getElementById('i_pwd').value = ''
      if (!res.success) {
        window.alert(res.error || 'Save failed')
        paintSectionStatus('st_imap', false, 'Email ingestion', res.error || 'Save failed')
      } else {
        await loadSettings()
        paintSectionStatus('st_imap', true, 'Email ingestion', 'IMAP settings saved (legacy Settings path).')
      }
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
      const ok = !!j?.success
      btn.textContent = ok ? 'Connected ✓' : 'Failed'
      paintSectionStatus(
        'st_imap',
        ok,
        'Email ingestion — connection test',
        ok ? 'IMAP credentials accepted.' : j?.error || 'Connection failed'
      )
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    } catch (e) {
      btn.textContent = 'Failed'
      paintSectionStatus('st_imap', false, 'Email ingestion — connection test', String(e))
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
      const r = await fetch('/api/ingestion/run', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      const ok = r.ok && (j.success !== false)
      btn.textContent = ok ? 'Done ✓' : 'Failed'
      paintSectionStatus(
        'st_imap',
        ok,
        'Email ingestion — run now',
        ok ? 'Ingestion job accepted by server.' : j.error || 'HTTP ' + r.status
      )
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    } catch (e) {
      btn.textContent = 'Failed'
      paintSectionStatus('st_imap', false, 'Email ingestion — run now', String(e))
      setTimeout(() => {
        btn.textContent = orig
        btn.disabled = false
      }, 2000)
    }
  })

  document.getElementById('test-telegram-notify')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-telegram-notify')
    if (!btn) return
    btn.disabled = true
    const orig = btn.textContent
    btn.textContent = 'Testing…'
    try {
      const pres = await patch({ telegramChatId: document.getElementById('n_tg')?.value?.trim() || null })
      if (!pres.success) {
        paintSectionStatus('st_notify', false, 'Telegram test', pres.error || 'Could not save chat id')
        return
      }
      const res = await fetch('/api/integrations/comms.telegram/test', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      const d = j?.data
      const ok = !!(j?.success && d && (d.status === 'OK' || d.status === 'WARN'))
      const msg = d?.message || j?.error || 'Request failed'
      paintSectionStatus('st_notify', ok, 'Telegram test', msg)
    } catch (e) {
      paintSectionStatus('st_notify', false, 'Telegram test', String(e))
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  })

  document.getElementById('send-test-email')?.addEventListener('click', async () => {
    const btn = document.getElementById('send-test-email')
    const orig = btn?.textContent || 'Send test email'
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Sending…'
    }
    try {
      const res = await fetch('/api/settings/test-email', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) {
        const err = j.error || j.message || res.statusText || 'Send failed'
        window.alert(err)
        paintSectionStatus('st_notify', false, 'Test email', String(err))
        return
      }
      paintSectionStatus(
        'st_notify',
        true,
        'Test email',
        'Check the inbox for your saved Alert email (may take a minute; check spam).'
      )
    } catch (e) {
      window.alert(String(e))
      paintSectionStatus('st_notify', false, 'Test email', String(e))
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = orig
      }
    }
  })

  document.getElementById('save-notify')?.addEventListener('click', () =>
    withButton('save-notify', 'Save', async () => {
      const res = await patch({
        alertEmail: document.getElementById('n_email').value || null,
        telegramChatId: document.getElementById('n_tg').value || null,
        monthlyLetterEnabled: document.getElementById('n_monthly').checked,
        alertsEnabled: document.getElementById('n_alerts').checked
      })
      if (!res.success) {
        window.alert(res.error || 'Save failed')
        paintSectionStatus('st_notify', false, 'Notifications', res.error || 'Save failed')
      } else {
        await loadSettings()
        paintSectionStatus('st_notify', true, 'Notifications', 'Alert channels and toggles saved.')
      }
    })
  )

  document.getElementById('save-demo')?.addEventListener('click', () =>
    withButton('save-demo', 'Apply', async () => {
      const res = await patch({
        demoModeEnabled: document.getElementById('d_enabled').checked,
        demoPersona: document.getElementById('d_persona').value || 'engineer'
      })
      if (!res.success) {
        window.alert(res.error || 'Apply failed')
        paintSectionStatus('st_demo', false, 'Demo mode', res.error || 'Apply failed')
      } else {
        await loadSettings()
        paintSectionStatus(
          'st_demo',
          true,
          'Demo mode',
          document.getElementById('d_enabled').checked
            ? 'Demo on — demo DB was reseeded if you just enabled it.'
            : 'Demo off — routing to main portfolio DB.'
        )
      }
    })
  )

  // ---------- V6 Backups ----------
  document.getElementById('backup-export-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('backup-export-btn')
    if (!btn) return
    const orig = btn.textContent
    btn.disabled = true
    btn.textContent = 'Preparing…'
    try {
      const res = await fetch('/api/settings/backup/export', { credentials: 'same-origin' })
      if (!res.ok) {
        let err = 'Export failed'
        try { err = (await res.json()).error || err } catch { /* */ }
        paintSectionStatus('st_backup', false, 'Backup', err)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      a.download = 'pie-backup-' + stamp + '.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      paintSectionStatus('st_backup', true, 'Backup', 'Download started — keep this file safe.')
    } catch (e) {
      paintSectionStatus('st_backup', false, 'Backup', e?.message || String(e))
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  })

  document.getElementById('backup-import-btn')?.addEventListener('click', () => {
    const file = document.getElementById('backup-file')
    if (file) file.click()
  })

  document.getElementById('backup-file')?.addEventListener('change', async (e) => {
    const f = e.target?.files && e.target.files[0]
    if (!f) return
    const text = await f.text()
    let bundle = null
    try {
      bundle = JSON.parse(text)
    } catch {
      paintSectionStatus('st_backup', false, 'Restore', 'Selected file is not valid JSON.')
      e.target.value = ''
      return
    }
    if (!bundle || bundle.version !== 'PIE_V6_BACKUP_1') {
      paintSectionStatus('st_backup', false, 'Restore', 'Unsupported backup format.')
      e.target.value = ''
      return
    }
    const phrase = window.prompt('Type "restore" to confirm. This is additive — existing rows are kept.')
    if (String(phrase || '').trim() !== 'restore') {
      paintSectionStatus('st_backup', false, 'Restore', 'Confirmation cancelled.')
      e.target.value = ''
      return
    }
    try {
      const res = await fetch('/api/settings/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ bundle, confirmPhrase: 'restore' })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) {
        paintSectionStatus('st_backup', false, 'Restore', j.error || res.statusText)
        return
      }
      const summary = (j.data?.results || [])
        .map((r) => r.table + ': +' + r.inserted + ' new, ' + r.skipped + ' skipped')
        .join(' · ')
      paintSectionStatus('st_backup', true, 'Restore', summary || 'Restore complete.')
    } catch (err) {
      paintSectionStatus('st_backup', false, 'Restore', err?.message || String(err))
    } finally {
      e.target.value = ''
    }
  })

  document.getElementById('fresh-start-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('fresh-start-btn')
    const orig = btn?.textContent || 'Reset my portfolio'
    const phrase = String(document.getElementById('fresh-start-confirm')?.value || '').trim()
    if (phrase !== 'reset') {
      paintSectionStatus(
        'st_portfolio_reset',
        false,
        'Portfolio reset',
        'Type the word reset (lowercase) in the field above, then press the button again.'
      )
      return
    }
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Resetting…'
    }
    try {
      const res = await fetch('/api/settings/portfolio-fresh-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ confirmPhrase: 'reset' })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) {
        const err = j.error || j.message || res.statusText || 'Reset failed'
        window.alert(err)
        paintSectionStatus('st_portfolio_reset', false, 'Portfolio reset', String(err))
        return
      }
      const n = j?.data?.truncatedTableCount
      const detail =
        (j?.data?.message || 'Personal portfolio cleared.') +
        (typeof n === 'number' ? ` (${n} tables truncated.)` : '')
      paintSectionStatus('st_portfolio_reset', true, 'Portfolio reset', detail)
      const inp = document.getElementById('fresh-start-confirm')
      if (inp) inp.value = ''
      await loadSettings()
    } catch (e) {
      window.alert(String(e))
      paintSectionStatus('st_portfolio_reset', false, 'Portfolio reset', String(e))
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = orig
      }
    }
  })

  document.getElementById('reload-health')?.addEventListener('click', async () => {
    const btn = document.getElementById('reload-health')
    const wrap = document.getElementById('health-recheck-wrap')
    const label = document.getElementById('health-recheck-label')
    const orig = btn ? btn.textContent : 'Re-check'
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Checking…'
    }
    if (wrap) {
      wrap.style.display = 'block'
      wrap.setAttribute('aria-hidden', 'false')
    }
    if (label) label.textContent = 'Running system checks…'
    try {
      await loadHealth()
      if (label) label.textContent = 'Checks finished.'
    } catch (e) {
      if (label) label.textContent = 'Checks failed: ' + (e instanceof Error ? e.message : String(e))
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = orig
      }
      window.setTimeout(() => {
        if (wrap) {
          wrap.style.display = 'none'
          wrap.setAttribute('aria-hidden', 'true')
        }
        if (label) label.textContent = ''
      }, 1600)
    }
  })
  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSettingsPage)
  } else {
    wireSettingsPage()
  }
})()
