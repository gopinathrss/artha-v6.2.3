;(function () {
  'use strict'

  function tokenFromHash() {
    const h = window.location.hash.replace(/^#/, '')
    try {
      return decodeURIComponent(h).trim()
    } catch {
      return h.trim()
    }
  }

  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    const token = tokenFromHash()
    const password = document.getElementById('np')?.value || ''
    const msg = document.getElementById('msg')
    if (!token) {
      if (msg) msg.textContent = 'Missing token in URL — open the link from your email.'
      return
    }
    if (password.length < 8) {
      if (msg) msg.textContent = 'Password must be at least 8 characters.'
      return
    }
    const r = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token, password })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.success) {
      if (msg) msg.textContent = j.error || 'Reset failed'
      return
    }
    window.location.href = '/?welcome=1'
  })
})()
