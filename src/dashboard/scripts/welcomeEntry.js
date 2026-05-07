/**
 * After login: ?welcome=1 shows a short “feel good” overlay while the overview shell loads.
 */
;(function () {
  'use strict'

  function stripWelcomeParam() {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('welcome')) return
    u.searchParams.delete('welcome')
    const q = u.searchParams.toString()
    window.history.replaceState({}, document.title, u.pathname + (q ? '?' + q : '') + u.hash)
  }

  function run() {
    const u = new URL(window.location.href)
    if (u.searchParams.get('welcome') !== '1') return
    if (window.location.pathname !== '/') return

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'status')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.35);backdrop-filter:blur(6px);animation:fadeIn 0.35s ease'
    overlay.innerHTML =
      '<div style="max-width:22rem;padding:2rem 2.25rem;border-radius:1rem;border:1px solid var(--border);' +
      'background:var(--surface-1);box-shadow:0 20px 50px rgba(0,0,0,0.15);text-align:center">' +
      '<div style="font-size:2rem;margin-bottom:0.5rem" aria-hidden="true">✨</div>' +
      '<div style="font-weight:600;font-size:1.2rem;margin-bottom:0.35rem">Welcome back to PIE</div>' +
      '<div class="form-field-help" style="margin:0 0 1rem">Your workspace is opening — charts, FX, and health checks load in the background.</div>' +
      '<div style="height:3px;border-radius:2px;background:var(--border);overflow:hidden">' +
      '<div id="pie-welcome-bar" style="height:100%;width:0;background:var(--color-accent, #6366f1);transition:width 1.4s ease"></div></div></div>'
    const style = document.createElement('style')
    style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}'
    document.head.appendChild(style)
    document.body.appendChild(overlay)

    requestAnimationFrame(() => {
      const bar = document.getElementById('pie-welcome-bar')
      if (bar) bar.style.width = '100%'
    })

    window.setTimeout(() => {
      overlay.style.opacity = '0'
      overlay.style.transition = 'opacity 0.35s ease'
      window.setTimeout(() => {
        overlay.remove()
        style.remove()
        stripWelcomeParam()
      }, 380)
    }, 1600)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
