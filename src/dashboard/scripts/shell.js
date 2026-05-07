;(function () {
  const menuToggle = document.getElementById('menu-toggle')
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebar-overlay')

  if (menuToggle && sidebar && overlay) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open')
      overlay.classList.toggle('open')
    })
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open')
      overlay.classList.remove('open')
    })
  }

  const path = window.location.pathname
  document.querySelectorAll('.sidebar-nav-item a').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href) return
    if (href === '/' && path === '/') {
      a.classList.add('active')
      return
    }
    if (href !== '/' && path.startsWith(href)) {
      a.classList.add('active')
    }
  })

  function paintTrustFromHealth(data) {
    const score = data?.trustScore
    const el = document.getElementById('trust-score')
    if (el != null && typeof score === 'number' && Number.isFinite(score)) {
      el.textContent = score + '%'
      el.style.color =
        score >= 80
          ? 'var(--color-positive-text)'
          : score >= 50
            ? 'var(--color-warning-text)'
            : 'var(--color-negative-text)'
    }
  }

  function onHealthEv(ev) {
    paintTrustFromHealth(ev.detail)
  }
  window.addEventListener('pie-health', onHealthEv)
  window.addEventListener('artha-health', onHealthEv)

  if (window.location.pathname === '/') {
    /* Overview publishes health after its own fetch — avoid duplicate /api/health on home */
  } else {
    fetch('/api/health')
      .then((r) => r.json())
      .then((json) => paintTrustFromHealth(json?.data))
      .catch(() => {})
  }

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((json) => {
      const d = json?.data
      if (!d || d.authDisabled || !d.authenticated) return
      const sb = document.getElementById('sidebar')
      if (!sb || sb.querySelector('[data-pie-signout]')) return
      const wrap = document.createElement('div')
      wrap.className = 'sidebar-section'
      wrap.style.marginTop = 'auto'
      wrap.innerHTML =
        '<button type="button" data-pie-signout class="btn btn-ghost btn-sm" style="width:100%;margin:0 var(--space-3) var(--space-4)">Sign out</button>'
      sb.appendChild(wrap)
      wrap.querySelector('[data-pie-signout]')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
        window.location.href = '/login.html'
      })
    })
    .catch(() => {})
})()
