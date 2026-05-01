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

  fetch('/api/health')
    .then((r) => r.json())
    .then((json) => {
      const score = json?.data?.trustScore
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
    })
    .catch(() => {})
})()
