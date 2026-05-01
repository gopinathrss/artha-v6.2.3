;(function () {
  const STORAGE_KEY = 'artha-theme-preference'

  function getStoredPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY)
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

  function resolveTheme() {
    const pref = getStoredPreference()
    if (pref === 'light' || pref === 'dark') return pref
    return getSystemTheme()
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
  }

  applyTheme(resolveTheme())

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      const pref = getStoredPreference()
      if (pref === 'light' || pref === 'dark') return
      applyTheme(e.matches ? 'dark' : 'light')
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  }

  window.ArthaTheme = {
    getPreference: () => {
      const p = getStoredPreference()
      if (p === 'light' || p === 'dark') return p
      return 'system'
    },
    setPreference: (pref) => {
      if (pref === 'system') {
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* ignore */
        }
        applyTheme(getSystemTheme())
      } else if (pref === 'light' || pref === 'dark') {
        try {
          localStorage.setItem(STORAGE_KEY, pref)
        } catch {
          /* ignore */
        }
        applyTheme(pref)
      }
    },
    getResolvedTheme: () => document.documentElement.getAttribute('data-theme') || 'light'
  }

  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload')
    })
  })
})()
