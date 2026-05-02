;(function () {
  'use strict'

  const TAGS = [
    'allocation',
    'tax',
    'rebalance',
    'sip',
    'behavioral',
    'czech',
    'india',
    'cross-border',
    'horizon',
    'ai'
  ]

  let allPatterns = []
  const activeTags = new Set()

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function fmtConf(c) {
    const n = Number(c)
    return Number.isFinite(n) ? n.toFixed(2) : '—'
  }

  function truncate(text, max) {
    const t = String(text || '')
    if (t.length <= max) return { short: t, more: false }
    return { short: t.slice(0, max).trim() + '…', more: true, full: t }
  }

  function renderChips() {
    const el = document.getElementById('tag-chips')
    el.innerHTML = TAGS.map((tag) => {
      const on = activeTags.has(tag)
      return `<button type="button" class="btn ${on ? 'btn-primary' : 'btn-secondary'} btn-sm pat-tag" data-tag="${escapeHtml(
        tag
      )}">${escapeHtml(tag)}</button>`
    }).join('')
    el.querySelectorAll('.pat-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-tag') || ''
        if (activeTags.has(t)) activeTags.delete(t)
        else activeTags.add(t)
        renderChips()
        applyFilter()
      })
    })
  }

  function applyFilter() {
    const q = String(document.getElementById('pat-search')?.value || '').trim().toLowerCase()
    const tags = [...activeTags]
    const filtered = allPatterns.filter((p) => {
      if (tags.length && !tags.some((t) => p.tags.map((x) => x.toLowerCase()).includes(t))) return false
      if (!q) return true
      const blob = (p.title + ' ' + p.principle).toLowerCase()
      return blob.includes(q)
    })
    renderGrid(filtered)
  }

  function renderGrid(list) {
    const grid = document.getElementById('patterns-grid')
    if (!list.length) {
      grid.innerHTML =
        '<section class="card"><div class="empty-state"><div class="empty-state-message">No patterns match.</div></div></section>'
      return
    }
    grid.innerHTML = list
      .map((p) => {
        const { short, more, full } = truncate(p.principle, 420)
        const tags = (p.tags || [])
          .map((t) => `<span class="badge badge-neutral">${escapeHtml(t)}</span>`)
          .join(' ')
        const src = (p.sources || [])
          .map((s) => escapeHtml(s))
          .join(' · ')
        const bodyId = 'pr-' + p.id.replace(/[^a-z0-9]/gi, '')
        return `
        <section class="card" style="margin-bottom: var(--space-4)">
          <div class="card-header" style="align-items: flex-start">
            <div style="min-width: 0">
              <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap">
                <span class="badge badge-info">${escapeHtml(p.id)}</span>
                <h2 class="card-title" style="margin: 0">${escapeHtml(p.title)}</h2>
                <span class="form-field-help">confidence ${fmtConf(p.confidence)}</span>
              </div>
              <p class="card-subtitle" id="${bodyId}-short" style="margin-top: var(--space-3); white-space: pre-wrap">${escapeHtml(
                short
              )}</p>
              <p class="card-subtitle" id="${bodyId}-full" style="display:none;margin-top:var(--space-3);white-space:pre-wrap">${escapeHtml(
                full || p.principle
              )}</p>
              ${
                more
                  ? `<button type="button" class="btn btn-ghost btn-sm pat-more" data-id="${escapeHtml(
                      bodyId
                    )}">Show more</button>`
                  : ''
              }
              <div style="margin-top: var(--space-3)">${tags}</div>
              <p class="form-field-help" style="margin-top: var(--space-2); font-style: italic">${escapeHtml(
                src || ''
              )}</p>
            </div>
          </div>
        </section>`
      })
      .join('')
    grid.querySelectorAll('.pat-more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const s = document.getElementById(id + '-short')
        const f = document.getElementById(id + '-full')
        if (!s || !f) return
        const open = f.style.display !== 'none'
        f.style.display = open ? 'none' : 'block'
        s.style.display = open ? 'block' : 'none'
        btn.textContent = open ? 'Show more' : 'Show less'
      })
    })
  }

  async function load() {
    try {
      const res = await fetch('/api/patterns').then((r) => r.json())
      allPatterns = res?.data || []
      renderChips()
      applyFilter()
    } catch {
      document.getElementById('patterns-grid').innerHTML =
        '<section class="card"><div class="empty-state"><div class="empty-state-message">Could not load patterns.</div></div></section>'
    }
  }

  document.getElementById('pat-search')?.addEventListener('input', () => applyFilter())
  document.getElementById('refresh-btn')?.addEventListener('click', () => load())

  load()
})()
