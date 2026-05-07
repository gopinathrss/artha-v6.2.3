;(function () {
  'use strict'

  function qs(name) {
    const u = new URL(window.location.href)
    return u.searchParams.get(name) || '/'
  }

  function setMsg(t, ok) {
    const el = document.getElementById('auth-msg')
    if (!el) return
    el.textContent = t || ''
    el.style.color = ok === false ? 'var(--color-negative-text, #b91c1c)' : ''
  }

  function goNext() {
    let path = qs('next')
    if (!path || !path.startsWith('/')) path = '/'
    const u = new URL(path, window.location.origin)
    u.searchParams.set('welcome', '1')
    window.location.href = u.pathname + u.search + u.hash
  }

  async function boot() {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' })
    const j = await r.json().catch(() => ({}))
    const d = j?.data
    if (d?.authDisabled) {
      document.getElementById('auth-disabled').style.display = 'block'
      return
    }
    document.getElementById('auth-forms').style.display = 'block'
    if (d?.authenticated) {
      goNext()
      return
    }
    const tabPrimary = document.getElementById('tab-primary')
    if (d?.needsBootstrap) {
      document.getElementById('bootstrap-panel').style.display = 'block'
      if (tabPrimary) {
        tabPrimary.textContent = 'First setup'
        tabPrimary.setAttribute('aria-label', 'First-time setup')
      }
    } else {
      document.getElementById('login-panel').style.display = 'block'
      if (tabPrimary) {
        tabPrimary.textContent = 'Sign in'
        tabPrimary.setAttribute('aria-label', 'Sign in')
      }
    }
  }

  async function doBootstrap() {
    const bootstrapKey = document.getElementById('boot-key')?.value?.trim() || ''
    const password = document.getElementById('boot-pw')?.value || ''
    setMsg('')
    const r = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ bootstrapKey, password })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.success) {
      setMsg(j.error || 'Setup failed', false)
      return
    }
    goNext()
  }

  async function doLogin() {
    const password = document.getElementById('login-pw')?.value || ''
    setMsg('')
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.success) {
      setMsg(j.error || 'Login failed', false)
      return
    }
    goNext()
  }

  document.getElementById('btn-bootstrap')?.addEventListener('click', () => void doBootstrap())
  document.getElementById('btn-login')?.addEventListener('click', () => void doLogin())

  document.getElementById('boot-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doBootstrap()
  })
  document.getElementById('boot-key')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('boot-pw')?.focus()
  })
  document.getElementById('login-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doLogin()
  })

  void boot()
})()
