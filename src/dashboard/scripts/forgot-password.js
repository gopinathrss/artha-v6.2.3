;(function () {
  'use strict'

  document.getElementById('btn-forgot')?.addEventListener('click', async () => {
    const email = document.getElementById('em')?.value?.trim() || ''
    const msg = document.getElementById('msg')
    if (!email) {
      if (msg) msg.textContent = 'Enter your alert email address.'
      return
    }
    const r = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email })
    })
    const j = await r.json().catch(() => ({}))
    if (msg) {
      msg.textContent =
        j?.data?.message ||
        j?.error ||
        (r.ok ? 'If this email matches your alert address, a reset link was sent.' : 'Request failed')
    }
  })
})()
