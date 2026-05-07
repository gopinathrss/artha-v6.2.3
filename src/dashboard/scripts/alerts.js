/**
 * /alerts — V5 rebuild.
 *
 * GET /api/alerts (active only) or /api/alerts?includeDismissed=1.
 * Each alert renders as an .alert-row with severity dot, title, message
 * and a Dismiss button. Hero shows aggregate counts.
 *
 * Topbar action "Run evaluation" calls POST /api/alerts/evaluate which
 * forces a re-scan and reloads the list.
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

  function dotClass(urgency) {
    const u = String(urgency || '').toUpperCase()
    if (u === 'CRITICAL' || u === 'CRIT') return 'crit'
    if (u === 'WARNING' || u === 'WARN' || u === 'HIGH') return 'warn'
    return 'info'
  }

  function badgeClass(urgency) {
    const u = String(urgency || '').toUpperCase()
    if (u === 'CRITICAL' || u === 'CRIT') return 'badge-negative'
    if (u === 'WARNING' || u === 'WARN' || u === 'HIGH') return 'badge-warning'
    return 'badge-info'
  }

  function humaniseKey(key) {
    return String(key || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function whenStr(s) {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  async function load(showDismissed) {
    const subtitle = document.getElementById('list-subtitle')
    subtitle.textContent = 'Loading…'

    let alerts = []
    try {
      const q = showDismissed ? '?includeDismissed=1' : ''
      const res = await fetch('/api/alerts' + q).then((r) => r.json())
      alerts = res?.data?.alerts || []
      const foot = document.getElementById('alerts-retention-note')
      if (foot) foot.textContent = res?.data?.alertRetentionNote || ''
    } catch {}

    renderHero(alerts)
    renderList(alerts, showDismissed)
  }

  function renderHero(alerts) {
    const active = alerts.filter((a) => String(a.status || '').toUpperCase() === 'ACTIVE').length
    const dismissed = alerts.filter((a) => String(a.status || '').toUpperCase() === 'DISMISSED').length
    const resolved = alerts.filter((a) => String(a.status || '').toUpperCase() === 'RESOLVED').length
    const critical = alerts.filter(
      (a) => String(a.urgency || '').toUpperCase() === 'CRITICAL' &&
             String(a.status || '').toUpperCase() === 'ACTIVE'
    ).length

    document.getElementById('hero-active').textContent = String(active)
    document.getElementById('hero-sub').textContent =
      active === 0
        ? 'No active alerts. The system is watching your wealth.'
        : active + ' ' + (active === 1 ? 'alert needs' : 'alerts need') + ' your attention.'
    document.getElementById('stat-active').textContent = String(active)
    document.getElementById('stat-resolved').textContent = String(resolved)
    document.getElementById('stat-dismissed').textContent = String(dismissed)
    document.getElementById('stat-critical').textContent = String(critical)

    const critEl = document.getElementById('stat-critical')
    if (critical > 0) critEl.style.color = 'var(--color-negative-text)'
  }

  function renderList(alerts, showDismissed) {
    const list = document.getElementById('alert-list')
    const subtitle = document.getElementById('list-subtitle')

    if (alerts.length === 0) {
      subtitle.textContent = 'No alerts'
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-message">${showDismissed ? 'No alerts (including dismissed).' : 'No active alerts. System is watching your wealth.'}</div>
        </div>
      `
      return
    }

    subtitle.textContent =
      alerts.length + ' ' + (alerts.length === 1 ? 'alert' : 'alerts') +
      (showDismissed ? ' (including dismissed)' : '')

    list.innerHTML = alerts
      .map((a) => {
        const status = String(a.status || 'ACTIVE').toUpperCase()
        const urgency = String(a.urgency || 'INFO').toUpperCase()
        const trigger = String(a.triggerType || a.alertKey || '')
        const fireCount = a.fireCount != null ? Number(a.fireCount) : null
        const title = a.title || humaniseKey(a.alertKey || trigger || 'Alert')
        const message = a.message || ''

        const meta = [
          urgency,
          trigger ? humaniseKey(trigger) : null,
          status === 'DISMISSED' ? 'Dismissed' : null,
          status === 'RESOLVED' ? 'Resolved' : null,
          fireCount != null && fireCount > 1 ? `Fired ${fireCount}x` : null,
          a.firedAt ? whenStr(a.firedAt) : null
        ]
          .filter(Boolean)
          .join(' · ')

        const action =
          status === 'ACTIVE'
            ? `<button class="btn btn-ghost btn-sm" data-dismiss="${escapeHtml(a.id)}" type="button">Dismiss</button>`
            : `<span class="badge ${status === 'DISMISSED' ? 'badge-neutral' : 'badge-positive'}">${status === 'DISMISSED' ? 'Dismissed' : 'Resolved'}</span>`

        return `
          <div class="alert-row">
            <div class="alert-row-dot ${dotClass(urgency)}"></div>
            <div>
              <div class="alert-row-title">
                ${escapeHtml(title)}
                <span class="badge ${badgeClass(urgency)}" style="margin-left: var(--space-2);">${escapeHtml(urgency)}</span>
              </div>
              <div class="alert-row-message">${escapeHtml(message)}</div>
              <div class="alert-row-meta">${escapeHtml(meta)}</div>
            </div>
            <div>${action}</div>
          </div>
        `
      })
      .join('')

    list.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-dismiss')
        if (!id) return
        btn.disabled = true
        try {
          const dr = await fetch('/api/alerts/' + encodeURIComponent(id) + '/dismiss', {
            method: 'POST'
          })
          if (dr.ok) {
            await load(document.getElementById('show-dismissed').checked)
          } else {
            btn.disabled = false
          }
        } catch {
          btn.disabled = false
        }
      })
    })
  }

  document.getElementById('show-dismissed')?.addEventListener('change', (e) => {
    load(e.target.checked)
  })

  document.getElementById('evaluate-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('evaluate-btn')
    btn.disabled = true
    btn.textContent = 'Evaluating…'
    try {
      await fetch('/api/alerts/evaluate', { method: 'POST' })
      await load(document.getElementById('show-dismissed').checked)
    } finally {
      btn.disabled = false
      btn.textContent = 'Run evaluation'
    }
  })

  load(false)
})()
