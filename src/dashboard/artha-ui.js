;(function () {
  const ArthaUI = {}

  ArthaUI.initTheme = function initTheme() {
    const v = localStorage.getItem('artha_theme') || 'light'
    document.documentElement.setAttribute('data-theme', v)
  }

  ArthaUI.toggleTheme = function toggleTheme() {
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
      fetch('/api/health')
        .then(function (r) {
          return r.json()
        })
        .then(function (j) {
          const s = j.data && j.data.trustScore
          if (s != null) tr.textContent = 'Trust ' + s + '%'
        })
        .catch(function () {})
    }
  }

  window.ArthaUI = ArthaUI
})()
