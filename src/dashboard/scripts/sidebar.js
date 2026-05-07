/**
 * V5 sidebar — renders the Workspace + Intelligence sections, Settings link
 * and Trust score footer into <aside id="sidebar"> on every page that opts in
 * by leaving the aside empty.
 *
 * The Overview page (/) ships its sidebar inline in index.html (frozen). Every
 * other V5 page ships an empty <aside class="sidebar" id="sidebar"></aside>
 * and lets this script populate it. shell.js still handles the .active class
 * by matching window.location.pathname against each <a href>.
 *
 * Keep this file dependency-free and side-effect-isolated: it only writes
 * innerHTML if the aside is empty. That means the Overview page is unaffected
 * even if the script is loaded (defensive, since Overview already has markup).
 */
;(function () {
  const aside = document.getElementById('sidebar')
  if (!aside) return
  // Respect inline markup (Overview): only inject if empty.
  if (aside.innerHTML.trim().length > 0) return

  const ICON = {
    overview:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7 L8 2 L14 7 V13 A1 1 0 0 1 13 14 H3 A1 1 0 0 1 2 13 Z"/></svg>',
    portfolio:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 2 V8 L13 8"/></svg>',
    'this-month':
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6 H14 M5 1.5 V4.5 M11 1.5 V4.5"/></svg>',
    india:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 4 H14 M2 8 H14 M2 12 H14"/></svg>',
    'tax-calendar':
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4 V8 L11 10"/></svg>',
    finances:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12 V4 H14 V12 Z M2 8 H14"/></svg>',
    intelligence:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M8 1 V3 M8 13 V15 M1 8 H3 M13 8 H15 M3.2 3.2 L4.6 4.6 M11.4 11.4 L12.8 12.8 M3.2 12.8 L4.6 11.4 M11.4 4.6 L12.8 3.2"/></svg>',
    library:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 2 H10 A3 3 0 0 1 13 5 V14 H6 A3 3 0 0 1 3 11 Z M6 14 A3 3 0 0 0 3 11"/></svg>',
    reports:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5 5 H11 M5 8 H11 M5 11 H8"/></svg>',
    alerts:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12 H13 L12 7 A4 4 0 0 0 4 7 Z M6.5 12.5 A1.5 1.5 0 0 0 9.5 12.5"/></svg>',
    backtest:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 14 V3 M3 11 L7 7 L10 10 L13 5 M13 5 H10 M13 5 V8"/></svg>',
    patterns:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 2 H10 A3 3 0 0 1 13 5 V14 H6 A3 3 0 0 1 3 11 Z M6 14 A3 3 0 0 0 3 11"/></svg>',
    accounts:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M2 7 H14 M5 10 H7"/></svg>',
    settings:
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="2"/><path d="M8 1 V3 M8 13 V15 M1 8 H3 M13 8 H15 M2.5 2.5 L4 4 M12 12 L13.5 13.5 M2.5 13.5 L4 12 M12 4 L13.5 2.5"/></svg>',
    help:
      '<svg class="sidebar-nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M5 3 H11 A2 2 0 0 1 13 5 V11 A2 2 0 0 1 11 13 H5 A2 2 0 0 1 3 11 V5 A2 2 0 0 1 5 3 Z"/><path d="M6 6 H10 M6 9 H10 M8 12 V12.01"/></svg>'
  }

  const navItem = (href, key, label) =>
    `<li class="sidebar-nav-item"><a href="${href}" data-page="${key}">${ICON[key]}${label}</a></li>`

  aside.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-mark"><img src="/assets/pie-logo.svg" width="32" height="32" alt="PIE" /></div>
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-name">PIE</div>
        <div class="sidebar-brand-sub">Personal Investment Engine</div>
      </div>
    </div>

    <nav class="sidebar-section">
      <div class="sidebar-section-label">Workspace</div>
      <ul class="sidebar-nav">
        ${navItem('/', 'overview', 'Overview')}
        ${navItem('/portfolio', 'portfolio', 'Portfolio')}
        ${navItem('/accounts', 'accounts', 'Accounts')}
        ${navItem('/this-month', 'this-month', 'This Month')}
        ${navItem('/india', 'india', 'India')}
        ${navItem('/tax-calendar', 'tax-calendar', 'Tax Calendar')}
        ${navItem('/finances', 'finances', 'Finances')}
      </ul>
    </nav>

    <nav class="sidebar-section">
      <div class="sidebar-section-label">Intelligence</div>
      <ul class="sidebar-nav">
        ${navItem('/intelligence', 'intelligence', 'Ask PIE')}
        ${navItem('/library', 'library', 'Library')}
        ${navItem('/backtest', 'backtest', 'Backtest Lab')}
        ${navItem('/patterns', 'patterns', 'Patterns')}
        ${navItem('/reports', 'reports', 'Reports')}
        ${navItem('/alerts', 'alerts', 'Alerts')}
        ${navItem('/help', 'help', 'Help')}
      </ul>
    </nav>

    <div class="sidebar-footer">
      <a href="/settings" data-page="settings">${ICON.settings}Settings</a>
      <div class="sidebar-trust">
        Trust score: <span id="trust-score" style="font-weight: var(--weight-semibold); color: var(--color-text-secondary);">—</span>
      </div>
    </div>
  `
})()
