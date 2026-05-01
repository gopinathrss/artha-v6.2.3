;(function () {
  /** Coerce API / Prisma Decimal strings with Number() in page scripts before .toFixed — this module has none on raw API fields. */
  const ArthaUI = {}

  ArthaUI.initTheme = function initTheme() {
    if (window.ArthaTheme) return
    const v = localStorage.getItem('artha_theme') || 'light'
    document.documentElement.setAttribute('data-theme', v)
  }

  ArthaUI.toggleTheme = function toggleTheme() {
    if (window.ArthaTheme) {
      const cur = window.ArthaTheme.getResolvedTheme() === 'dark' ? 'dark' : 'light'
      window.ArthaTheme.setPreference(cur === 'dark' ? 'light' : 'dark')
      return
    }
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    const next = cur === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('artha_theme', next)
  }

  ArthaUI.setGreeting = function setGreeting(el) {
    if (!el) return
    const h = new Date().getHours()
    const g =
      h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    el.textContent = g + ' — Artha'
  }

  ArthaUI.formatCZK = function formatCZK(n) {
    const v = Number(n) || 0
    return (
      v.toLocaleString('cs-CZ', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' Kč'
    )
  }

  ArthaUI.formatEUR = function formatEUR(n) {
    const v = Number(n) || 0
    return v.toLocaleString('de-DE', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' €'
  }

  ArthaUI.formatINR = function formatINR(n) {
    const v = Number(n) || 0
    return '₹ ' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  }

  ArthaUI._fx = null
  ArthaUI.prefetchFx = function prefetchFx() {
    return fetch('/api/currency/rates')
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        const u = j.data && j.data.czkPerUnit
        if (u && (u.EUR != null || u.INR != null)) {
          ArthaUI._fx = { EUR: u.EUR, USD: u.USD, INR: u.INR }
        } else ArthaUI._fx = null
        return ArthaUI._fx
      })
      .catch(function () {
        ArthaUI._fx = null
        return null
      })
  }

  /** CZK source amount → display per localStorage `artha_display_ccy` (needs prefetchFx) */
  ArthaUI.formatMoneyFromCzk = function formatMoneyFromCzk(czk) {
    const v = Number(czk) || 0
    const c = localStorage.getItem('artha_display_ccy') || 'CZK'
    if (c === 'CZK') return ArthaUI.formatCZK(v)
    const fx = ArthaUI._fx
    if (!fx || fx[c] == null || !isFinite(fx[c]) || fx[c] === 0) return ArthaUI.formatCZK(v)
    const n = v / fx[c]
    if (c === 'EUR') return n.toLocaleString('de-DE', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' €'
    if (c === 'INR') return '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    if (c === 'USD') return n.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' $'
    return ArthaUI.formatCZK(v)
  }

  ArthaUI.escapeHtml = function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  ArthaUI.showToast = function showToast(msg, type) {
    let host = document.getElementById('toast')
    if (!host) {
      host = document.createElement('div')
      host.id = 'toast'
      host.className = 'toast'
      document.body.appendChild(host)
    }
    host.className = 'toast show ' + (type === 'error' ? 'toast-err' : 'toast-ok')
    host.textContent = String(msg)
    clearTimeout(host._t)
    host._t = setTimeout(() => {
      host.classList.remove('show')
    }, 3200)
  }

  ArthaUI.isDemoMode = function isDemoMode(apiJson) {
    return !!(apiJson && apiJson.demo === true)
  }

  ArthaUI.applyDemoChrome = function applyDemoChrome(isDemo) {
    if (isDemo) document.body.classList.add('demo-active')
    else document.body.classList.remove('demo-active')
    const b = document.getElementById('demoBanner')
    if (b) b.style.display = isDemo ? 'block' : 'none'
  }

  ArthaUI.initV4Shell = function initV4Shell() {
    const path0 = (window.location.pathname || '').split('?')[0] || '/'
    if (path0 !== '/onboarding') {
      void fetch('/api/profile/status')
        .then(function (r) {
          return r.json()
        })
        .then(function (j) {
          if (j && j.success && j.data && j.data.needsOnboarding) {
            window.location.replace('/onboarding')
          }
        })
        .catch(function () {})
    }
    void ArthaUI.prefetchFx()
    document.dispatchEvent(new CustomEvent('artha:fx-updated'))
    const order = ['CZK', 'EUR', 'INR']
    const pill = document.getElementById('currencyPill')
    if (pill) {
      const cur = function () {
        return localStorage.getItem('artha_display_ccy') || 'CZK'
      }
      const apply = function () {
        pill.textContent = cur()
        void ArthaUI.prefetchFx().then(function () {
          document.dispatchEvent(new CustomEvent('artha:fx-updated'))
        })
      }
      apply()
      pill.style.cursor = 'pointer'
      pill.setAttribute('role', 'button')
      pill.setAttribute('tabindex', '0')
      pill.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          pill.click()
        }
      })
      pill.addEventListener('click', function () {
        const i = order.indexOf(cur())
        const next = order[(i + 1) % order.length]
        localStorage.setItem('artha_display_ccy', next)
        apply()
      })
    }
    const tr = document.getElementById('trustLine')
    if (tr) {
      Promise.all([
        fetch('/api/health')
          .then(function (r) {
            return r.json()
          })
          .catch(function () {
            return null
          }),
        fetch('/api/currency/rates')
          .then(function (r) {
            return r.json()
          })
          .catch(function () {
            return null
          })
      ]).then(function (pair) {
        const j = pair[0]
        const fxJ = pair[1]
        window.__arthaHealth = j
        const path = (window.location.pathname || '/').split('?')[0] || '/'
        const map = {
          '/': ['DB_HEALTH', 'FX_FRESHNESS', 'PROFILE_COMPLETE'],
          '/this-month': ['PLAN_COVERAGE', 'ADHERENCE_KNOWN'],
          '/portfolio': ['NAV_FRESHNESS', 'FX_FRESHNESS'],
          '/india': ['NAV_FRESHNESS'],
          '/intelligence': ['AI_REACHABLE'],
          '/reports': ['DB_HEALTH']
        }
        const rel = map[path] || []
        if (j && j.data && j.data.checks && rel.length) {
          const fail = (j.data.checks || []).filter(function (c) {
            return rel.indexOf(c.name) >= 0 && c.status === 'FAIL'
          })
          if (fail.length) {
            const c0 = fail[0]
            const msg =
              (c0 && c0.name ? c0.name : 'Check') +
              (c0 && c0.message ? ': ' + c0.message : '') +
              ' — this page may be incomplete.'
            let b = document.getElementById('arthaDegraded')
            if (!b) {
              b = document.createElement('div')
              b.id = 'arthaDegraded'
              b.setAttribute('role', 'status')
              b.className = 'setup-banner'
              b.style.cssText = 'background:rgba(184,146,42,0.18); border-bottom:1px solid rgba(184,146,42,0.35);'
              const demo0 = document.getElementById('demoBanner')
              if (demo0) demo0.insertAdjacentElement('afterend', b)
              else document.body.insertBefore(b, document.body.firstChild)
            }
            b.innerHTML =
              '<div class="setup-banner__inner" style="align-items:center; gap:10px; flex-wrap:wrap">' +
              '<span class="sub" style="max-width:72ch">' +
              (msg || '').replace(/</g, '&lt;') +
              '</span>' +
              '<a class="btn btn-gold" href="/settings" style="font-size:12px">Open health panel</a>' +
              '<button type="button" class="btn" id="arthaDegradedDismiss" style="font-size:12px">Dismiss</button></div>'
            const dismiss = document.getElementById('arthaDegradedDismiss')
            if (dismiss)
              dismiss.addEventListener('click', function () {
                b.style.display = 'none'
              })
          }
        }
        const s = j && j.data && j.data.trustScore
        const n = 12
        let line = s != null ? 'Trust ' + s + '% (' + n + ' checks)' : ''
        const fa = fxJ && fxJ.data && fxJ.data.fetchedAt
        if (fa) {
          const t = new Date(fa)
          const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Prague',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).formatToParts(t)
          const hh = parts.find(function (p) {
            return p.type === 'hour'
          })
          const mm = parts.find(function (p) {
            return p.type === 'minute'
          })
          const bit = 'Rates ' + (hh ? hh.value : '?') + ':' + (mm ? mm.value : '?') + ' Prague'
          line = line ? line + ' · ' + bit : bit
        }
        if (line) tr.textContent = line
      })
    }
    ArthaUI.initSetupBanner()
    ArthaUI.applyOnboardingNav()
  }

  /** Sidebar link: "✨ Complete Setup" + gold dot while incomplete; "Profile" → /settings when done. */
  ArthaUI.applyOnboardingNav = function applyOnboardingNav() {
    const el = document.querySelector('a[data-artha-setup-nav]')
    if (!el) return
    fetch('/api/setup-status')
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        if (!j || !j.success || !j.data) return
        const done = j.data.onboardingComplete === true
        const label = el.querySelector('.artha-setup-label')
        const dot = el.querySelector('.artha-setup-dot')
        if (done) {
          el.setAttribute('href', '/settings')
          if (label) label.textContent = 'Profile'
          el.classList.add('artha-setup-nav--complete')
          el.classList.remove('active')
        } else {
          el.setAttribute('href', '/onboarding')
          if (label) label.textContent = '✨ Complete Setup'
          el.classList.remove('artha-setup-nav--complete')
          if (window.location.pathname === '/onboarding') {
            el.classList.add('active')
          } else {
            el.classList.remove('active')
          }
        }
        if (dot) {
          dot.style.display = done ? 'none' : 'inline-block'
        }
      })
      .catch(function () {})
  }

  /** Skippable wizard; banner stays until /api/onboarding/complete (not shown on /onboarding, hidden in demo). */
  ArthaUI.initSetupBanner = function initSetupBanner() {
    const path = window.location.pathname || ''
    if (path === '/onboarding' || path.indexOf('/onboarding') === 0) return
    fetch('/api/setup-status')
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        if (!j || !j.success || !j.data) return
        if (!j.data.showBanner) {
          const old = document.getElementById('setupBanner')
          if (old) old.remove()
          return
        }
        if (document.getElementById('setupBanner')) return
        const bar = document.createElement('div')
        bar.id = 'setupBanner'
        bar.className = 'setup-banner'
        bar.setAttribute('role', 'region')
        bar.setAttribute('aria-label', 'Complete setup')
        bar.innerHTML =
          '<div class="setup-banner__inner">' +
          '<span>Complete your Personal CFO setup to unlock plans, cashflow, and follow-through. You can skip the wizard &mdash; this bar stays until you finish.</span>' +
          '<a class="btn btn-gold" href="/onboarding">Complete setup</a>' +
          '</div>'
        const demo = document.getElementById('demoBanner')
        if (demo) {
          demo.insertAdjacentElement('afterend', bar)
        } else {
          document.body.insertBefore(bar, document.body.firstChild)
        }
      })
      .catch(function () {})
  }

  window.ArthaUI = ArthaUI
})()
