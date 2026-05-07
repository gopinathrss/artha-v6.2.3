;(function () {
  const STORAGE_KEY = 'pie-theme-preference'
  const LEGACY_STORAGE_KEY = 'artha-theme-preference'
  const MODES = new Set(['AUTO', 'LIGHT', 'DARK'])

  function getStoredPreference() {
    try {
      let v = localStorage.getItem(STORAGE_KEY)
      if (v == null || v === '') {
        const leg = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (leg != null && leg !== '') {
          localStorage.setItem(STORAGE_KEY, leg)
          v = leg
        }
      }
      return v
    } catch {
      return null
    }
  }

  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  /** DB mode AUTO|LIGHT|DARK → resolved light|dark for DOM */
  function resolvePaint(mode) {
    const m = (mode || 'AUTO').toUpperCase()
    if (m === 'LIGHT') return 'light'
    if (m === 'DARK') return 'dark'
    return getSystemTheme()
  }

  function applyTheme(resolved) {
    document.documentElement.setAttribute('data-theme', resolved)
  }

  function initialPaint() {
    const pref = getStoredPreference()
    if (pref === 'light' || pref === 'dark') {
      applyTheme(pref)
      return
    }
    if (pref && MODES.has(pref.toUpperCase())) {
      applyTheme(resolvePaint(pref))
      return
    }
    applyTheme(getSystemTheme())
  }

  initialPaint()

  // V6: accent color (BLUE | GREEN | PURPLE | AMBER | ROSE).
  const ACCENT_KEY = 'pie-accent'
  const ACCENTS = new Set(['BLUE', 'GREEN', 'PURPLE', 'AMBER', 'ROSE'])
  function applyAccent(name) {
    const v = ACCENTS.has(String(name || '').toUpperCase())
      ? String(name).toUpperCase()
      : 'BLUE'
    document.documentElement.setAttribute('data-pie-accent', v)
  }
  try {
    applyAccent(localStorage.getItem(ACCENT_KEY) || 'BLUE')
  } catch {
    applyAccent('BLUE')
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const pref = getStoredPreference()
      if (pref === 'light' || pref === 'dark') return
      const mode = (pref || 'AUTO').toUpperCase()
      if (mode === 'AUTO' || !MODES.has(mode)) applyTheme(getSystemTheme())
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  }

  function reconcileWithServer() {
    fetch('/api/app-settings/theme')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const mode = j?.data?.themeMode
        if (mode && MODES.has(String(mode).toUpperCase())) {
          const upper = String(mode).toUpperCase()
          try {
            localStorage.setItem(STORAGE_KEY, upper)
          } catch {
            /* */
          }
          applyTheme(resolvePaint(upper))
        }
        const accent = j?.data?.accentColor
        if (accent && ACCENTS.has(String(accent).toUpperCase())) {
          try {
            localStorage.setItem(ACCENT_KEY, String(accent).toUpperCase())
          } catch {
            /* */
          }
          applyAccent(accent)
        }
      })
      .catch(() => {})
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reconcileWithServer)
  } else {
    reconcileWithServer()
  }

  const api = {
    getPreference: () => {
      const p = getStoredPreference()
      if (p === 'light' || p === 'dark') return p
      if (p && MODES.has(p.toUpperCase())) return p.toUpperCase()
      return 'AUTO'
    },
    setPreference: (pref) => {
      const raw = String(pref || 'AUTO').toUpperCase()
      /** Settings UI radios use value="system"; DB + validator use AUTO. */
      const p = raw === 'SYSTEM' ? 'AUTO' : raw
      if (!MODES.has(p)) return
      try {
        localStorage.setItem(STORAGE_KEY, p)
      } catch {
        /* */
      }
      applyTheme(resolvePaint(p))
      fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeMode: p })
      }).catch(() => {})
    },
    getResolvedTheme: () => document.documentElement.getAttribute('data-theme') || 'light',
    getAccent: () => document.documentElement.getAttribute('data-pie-accent') || 'BLUE',
    setAccent: (name) => {
      applyAccent(name)
      try {
        localStorage.setItem(ACCENT_KEY, String(name || 'BLUE').toUpperCase())
      } catch {
        /* */
      }
    },
    reconcileWithServer
  }

  window.PieTheme = api
  window.ArthaTheme = api

  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload')
    })
  })
})()
