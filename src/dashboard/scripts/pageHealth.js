;(function () {
  'use strict'

  const PAGE_HEALTH_THRESHOLDS = {
    overview: { warnMinutes: 60, failMinutes: 480 }, // 1h warn, 8h fail
    portfolio: { warnMinutes: 60, failMinutes: 480 },
    thisMonth: { warnMinutes: 1440, failMinutes: 4320 }, // 1d warn, 3d fail
    accounts: { warnMinutes: 120, failMinutes: 720 },
    india: { warnMinutes: 1440, failMinutes: 4320 },
    taxCalendar: { warnMinutes: 1440, failMinutes: 4320 },
    finances: { warnMinutes: 4320, failMinutes: 43200 } // rarely changes
  }

  function getPageHealth(pageName, lastFetchedAt, hasError) {
    if (hasError) return 'red'
    if (!lastFetchedAt) return 'yellow'
    const ageMinutes = (Date.now() - new Date(lastFetchedAt).getTime()) / 60000
    const thresholds = PAGE_HEALTH_THRESHOLDS[pageName] ?? { warnMinutes: 60, failMinutes: 480 }
    if (ageMinutes >= thresholds.failMinutes) return 'red'
    if (ageMinutes >= thresholds.warnMinutes) return 'yellow'
    return 'green'
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function renderPageHealthDot(pageName, lastFetchedAt, hasError, tooltipText) {
    const state = getPageHealth(pageName, lastFetchedAt, hasError)
    const labels = {
      green: 'Data is fresh',
      yellow: 'Data may be stale — consider refreshing',
      red: 'Data is stale or has errors — refresh recommended'
    }
    const tooltip = tooltipText ?? labels[state]

    return (
      '<span class="page-health-dot page-health-dot--' +
      esc(state) +
      '" title="' +
      esc(tooltip) +
      '" aria-label="' +
      esc(tooltip) +
      '">' +
      '<span class="page-health-dot__pulse"></span>' +
      '</span>'
    )
  }

  function updatePageHealthDot(pageName, lastFetchedAt, hasError, tooltipText) {
    const container = document.getElementById('page-health-dot')
    if (!container) return
    container.innerHTML = renderPageHealthDot(pageName, lastFetchedAt, hasError, tooltipText)
  }

  // Expose globally (plain dashboard JS)
  window.PiePageHealth = {
    updatePageHealthDot,
    getPageHealth,
    renderPageHealthDot,
    PAGE_HEALTH_THRESHOLDS
  }
})()

