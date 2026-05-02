/**
 * /reports — V5 rebuild.
 *
 * Lists prior CFO_10 snapshots from /api/reports and generates new ones via
 * POST /api/reports/generate { type, audience }. The report viewer lives at
 * /reports/view/:id?token=… (server route, not under /api).
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

  function dateOnly(s) {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  function fmtPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    return (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(1) + '%'
  }

  function verdictClass(g) {
    if (g == null || !Number.isFinite(Number(g))) return 'badge-neutral'
    if (Number(g) > 0.5) return 'badge-positive'
    if (Number(g) < -0.5) return 'badge-negative'
    return 'badge-neutral'
  }

  async function loadOutcomes() {
    const tbody = document.getElementById('outcomes-tbody')
    try {
      const [sumRes, recRes] = await Promise.all([
        fetch('/api/outcomes/summary').then((r) => r.json()),
        fetch('/api/outcomes/recent?limit=20').then((r) => r.json())
      ])
      const s = sumRes?.data || {}
      document.getElementById('ot-total').textContent = String(s.totalRecommendations ?? '—')
      document.getElementById('ot-followed').textContent =
        s.followedPct != null ? `${s.followedPct}% (${s.followedCount ?? 0})` : '—'
      document.getElementById('ot-avg-f').textContent = fmtPct(s.avgGainFollowed90d)
      document.getElementById('ot-avg-s').textContent = fmtPct(s.avgGainSkipped90d)

      const rows = recRes?.data || []
      if (rows.length === 0) {
        tbody.innerHTML = `
          <tr><td colspan="6" class="empty-state"><div class="empty-state-message">No evaluated outcomes yet.</div></td></tr>`
        return
      }
      tbody.innerHTML = rows
        .map((o) => {
          const g = o.gainPctAt90d != null ? Number(o.gainPctAt90d) : null
          const v = g == null ? 'Pending' : g > 0.5 ? 'Positive' : g < -0.5 ? 'Negative' : 'Neutral'
          const ex = o.wasExecuted === true ? 'Yes' : o.wasExecuted === false ? 'No' : '—'
          return `
          <tr>
            <td><strong>${escapeHtml(o.fundName)}</strong></td>
            <td><span class="badge badge-info">${escapeHtml(o.rowType || '—')}</span></td>
            <td class="num">${escapeHtml(String(Math.round(Number(o.recommendedAmountCzk) || 0)))}</td>
            <td>${escapeHtml(ex)}</td>
            <td class="num">${g == null ? '—' : g.toFixed(1) + '%'}</td>
            <td><span class="badge ${verdictClass(g)}">${escapeHtml(v)}</span></td>
          </tr>`
        })
        .join('')
    } catch {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state"><div class="empty-state-message">Could not load outcomes.</div></td></tr>'
    }
  }

  async function load() {
    let reports = []
    try {
      const res = await fetch('/api/reports').then((r) => r.json())
      reports = res?.data?.reports || []
    } catch {}

    renderHero(reports)
    renderTable(reports)
    loadOutcomes()
  }

  function renderHero(reports) {
    const count = reports.length
    const internal = reports.filter(
      (r) => String(r.audience || '').toUpperCase() === 'INTERNAL'
    ).length
    const client = reports.filter(
      (r) => String(r.audience || '').toUpperCase() === 'CLIENT'
    ).length
    const last = reports[0]?.createdAt

    document.getElementById('hero-count').textContent = String(count)
    document.getElementById('stat-last').textContent = last ? dateOnly(last) : '—'
    document.getElementById('stat-internal').textContent = String(internal)
    document.getElementById('stat-client').textContent = String(client)
  }

  function renderTable(reports) {
    const tbody = document.getElementById('reports-tbody')
    const subtitle = document.getElementById('list-subtitle')

    if (reports.length === 0) {
      subtitle.textContent = 'No reports yet'
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">
            <div class="empty-state-message">No reports yet. Generate an Internal or Client report to open a printable view.</div>
          </td>
        </tr>
      `
      return
    }

    subtitle.textContent =
      reports.length + ' ' + (reports.length === 1 ? 'report' : 'reports') +
      ' · newest first'

    tbody.innerHTML = reports
      .map((r) => {
        const audience = String(r.audience || 'INTERNAL').toUpperCase()
        const audienceLabel = audience === 'CLIENT' ? 'Client' : 'Internal'
        const audienceBadge = audience === 'CLIENT' ? 'badge-info' : 'badge-positive'
        const base = r.id
          ? '/reports/view/' + encodeURIComponent(r.id) +
            '?token=' + encodeURIComponent(r.token || '')
          : '#'
        const downloadHref = base.includes('?') ? base + '&print=1' : base + '?print=1'
        const htmlOnly =
          r.id && r.token
            ? '/api/reports/' + encodeURIComponent(r.id) + '/html?token=' + encodeURIComponent(r.token)
            : '#'
        const typeLabel = r.title ? escapeHtml(r.title) : escapeHtml(r.type || 'CFO_10')
        return `
          <tr>
            <td><span class="text-secondary">${escapeHtml(whenStr(r.createdAt))}</span></td>
            <td><strong>${typeLabel}</strong>${r.type && r.title && r.type !== r.title ? ` <span class="text-secondary">(${escapeHtml(r.type)})</span>` : ''}</td>
            <td><span class="badge ${audienceBadge}">${audienceLabel}</span></td>
            <td><span class="text-secondary">${escapeHtml(r.periodLabel || r.monthYear || '—')}</span></td>
            <td>
              <a class="btn btn-secondary btn-sm" href="${escapeHtml(base)}" target="_blank" rel="noopener">View</a>
              <a class="btn btn-ghost btn-sm" href="${escapeHtml(htmlOnly)}" target="_blank" rel="noopener">HTML</a>
              <a class="btn btn-ghost btn-sm" href="${escapeHtml(downloadHref)}" target="_blank" rel="noopener">Print</a>
            </td>
          </tr>
        `
      })
      .join('')
  }

  async function generateSmart(type) {
    const map = { MONTHLY: 'smart-monthly', QUARTERLY: 'smart-quarterly', TAX_YEAR: 'smart-taxyear' }
    const labels = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', TAX_YEAR: 'Tax year' }
    const btn = document.getElementById(map[type])
    if (btn) {
      btn.disabled = true
      btn.textContent = '…'
    }
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, audience: 'INTERNAL' })
      }).then((r) => r.json())
      if (!res.success) throw new Error(res.error || 'generate failed')
      const url = res?.data?.viewUrl
      if (url) window.open(url, '_blank', 'noopener')
      await load()
    } catch (e) {
      alert(String(e.message || e))
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = labels[type]
      }
    }
  }

  async function generate(audience) {
    const internalBtn = document.getElementById('generate-internal')
    const clientBtn = document.getElementById('generate-client')
    ;[internalBtn, clientBtn].forEach((b) => {
      if (b) b.disabled = true
    })
    const targetBtn = audience === 'CLIENT' ? clientBtn : internalBtn
    const restoreLabel = audience === 'CLIENT' ? 'Client' : 'Internal'
    if (targetBtn) targetBtn.textContent = 'Generating…'

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CFO_10', audience })
      }).then((r) => r.json())

      const url = res?.data?.viewUrl
      if (url) window.open(url, '_blank', 'noopener')
      await load()
    } finally {
      ;[internalBtn, clientBtn].forEach((b) => {
        if (b) b.disabled = false
      })
      if (internalBtn) internalBtn.textContent = 'Internal'
      if (clientBtn) clientBtn.textContent = 'Client'
    }
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())
  document.getElementById('generate-internal')?.addEventListener('click', () => generate('INTERNAL'))
  document.getElementById('generate-client')?.addEventListener('click', () => generate('CLIENT'))
  document.getElementById('smart-monthly')?.addEventListener('click', () => generateSmart('MONTHLY'))
  document.getElementById('smart-quarterly')?.addEventListener('click', () => generateSmart('QUARTERLY'))
  document.getElementById('smart-taxyear')?.addEventListener('click', () => generateSmart('TAX_YEAR'))

  load()
})()
