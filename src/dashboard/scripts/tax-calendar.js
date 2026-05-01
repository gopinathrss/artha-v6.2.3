/**
 * /tax-calendar — V5 rebuild.
 *
 * Reads /api/overview which returns a `taxCalendar` array — every Czech
 * holding with its purchase date and computed tax-free date. Splits into
 * three buckets and renders each as a list of .tax-calendar-row entries.
 *
 *   - Imminent  (0 .. +90 days)
 *   - Upcoming  (+90 .. +365 days)
 *   - Tax-free  (already past tax-free date)
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

  function dateStr(s) {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function daysFromNow(s) {
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  // Czech 3-year rule. Mirrors the server-side derivation if `taxFreeDate` is
  // missing on a row (defensive — the API normally provides it).
  function effectiveTaxFreeDate(holding) {
    if (holding.taxFreeDate) return holding.taxFreeDate
    if (holding.purchaseStartDate) {
      const t = new Date(holding.purchaseStartDate)
      t.setFullYear(t.getFullYear() + 3)
      return t.toISOString()
    }
    return null
  }

  async function load() {
    let data = {}
    try {
      const res = await fetch('/api/overview').then((r) => r.json())
      data = res?.data || {}
    } catch {}

    const all = (data.taxCalendar || []).map((h) => {
      const tfd = effectiveTaxFreeDate(h)
      return {
        id: h.id || h.isin,
        name: h.name || h.isin || '—',
        isin: h.isin || '',
        valueCzk: Number(h.currentValueCzk) || 0,
        taxFreeDate: tfd,
        days: daysFromNow(tfd)
      }
    })

    const imminent = all
      .filter((h) => h.days != null && h.days >= 0 && h.days <= 90)
      .sort((a, b) => a.days - b.days)
    const upcoming = all
      .filter((h) => h.days != null && h.days > 90 && h.days <= 365)
      .sort((a, b) => a.days - b.days)
    const free = all
      .filter((h) => h.days != null && h.days < 0)
      .sort((a, b) => b.valueCzk - a.valueCzk)
    const lockedAll = all.filter((h) => h.days != null && h.days >= 0)
    const totalLocked = lockedAll.reduce((s, h) => s + h.valueCzk, 0)

    document.getElementById('hero-locked').textContent = fmt0(totalLocked) + ' Kč'
    document.getElementById('stat-now').textContent = String(free.length)
    document.getElementById('stat-90').textContent = String(imminent.length)
    document.getElementById('stat-365').textContent = String(upcoming.length)
    document.getElementById('stat-total').textContent = String(all.length)

    document.getElementById('imminent-subtitle').textContent =
      imminent.length + ' ' + (imminent.length === 1 ? 'holding' : 'holdings') + ' approaching tax-free'
    document.getElementById('imminent-list').innerHTML =
      imminent.length === 0
        ? `<div class="empty-state"><div class="empty-state-message">Nothing tax-free in the next 90 days.</div></div>`
        : imminent.map((h) => row(h, h.days < 30 ? 'warning' : 'info')).join('')

    document.getElementById('upcoming-subtitle').textContent =
      upcoming.length + ' ' + (upcoming.length === 1 ? 'holding' : 'holdings')
    document.getElementById('upcoming-list').innerHTML =
      upcoming.length === 0
        ? `<div class="empty-state"><div class="empty-state-message">Nothing in the +90 to +365 day window.</div></div>`
        : upcoming.map((h) => row(h, 'neutral')).join('')

    const freeValue = free.reduce((s, h) => s + h.valueCzk, 0)
    document.getElementById('free-subtitle').textContent =
      free.length + ' ' + (free.length === 1 ? 'holding' : 'holdings') +
      (freeValue > 0 ? ` · ${fmt0(freeValue)} Kč realisable` : '')
    document.getElementById('free-list').innerHTML =
      free.length === 0
        ? `<div class="empty-state"><div class="empty-state-message">Nothing has crossed tax-free yet.</div></div>`
        : free.map((h) => row(h, 'positive', /*isFree*/ true)).join('')
  }

  function row(h, badgeColor, isFree = false) {
    const days = h.days
    const badgeText = isFree
      ? days <= -1
        ? Math.abs(days) + 'd ago'
        : 'Tax-free'
      : days === 0
        ? 'Today'
        : days + 'd'

    return `
      <div class="tax-calendar-row">
        <div>
          <div class="tax-calendar-row-name">${escapeHtml(h.name)}</div>
          <div class="tax-calendar-row-meta">${escapeHtml(h.isin)} · ${escapeHtml(dateStr(h.taxFreeDate))}</div>
        </div>
        <div class="tax-calendar-row-value">${fmt0(h.valueCzk)} Kč</div>
        <span class="badge badge-${badgeColor}">${escapeHtml(badgeText)}</span>
      </div>
    `
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload())

  load().catch(() => {
    document.getElementById('imminent-list').innerHTML =
      `<div class="empty-state"><div class="empty-state-message">Could not load tax calendar.</div></div>`
  })
})()
