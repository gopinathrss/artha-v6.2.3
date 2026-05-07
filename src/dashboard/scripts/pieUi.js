/**
 * V6 shared UI primitives — drawer, toast, confirm dialog.
 * Token-driven, no inline colors/shadows. Loaded after fetchJson.js so pages
 * can use both via window.PieUi / window.PieFetch.
 */
;(function () {
  function ensureRoot() {
    let r = document.getElementById('pie-ui-root')
    if (!r) {
      r = document.createElement('div')
      r.id = 'pie-ui-root'
      document.body.appendChild(r)
    }
    return r
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag)
    if (attrs)
      Object.keys(attrs).forEach((k) => {
        if (k === 'class') e.className = attrs[k]
        else if (k === 'html') e.innerHTML = attrs[k]
        else if (k.startsWith('on') && typeof attrs[k] === 'function')
          e.addEventListener(k.slice(2).toLowerCase(), attrs[k])
        else if (attrs[k] != null) e.setAttribute(k, attrs[k])
      })
    ;(children || []).forEach((c) => {
      if (c == null) return
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    })
    return e
  }

  // ===== Toast =====
  function toast(message, kind) {
    const root = ensureRoot()
    let stack = root.querySelector('.pie-toast-stack')
    if (!stack) {
      stack = el('div', { class: 'pie-toast-stack', role: 'status', 'aria-live': 'polite' })
      root.appendChild(stack)
    }
    const t = el(
      'div',
      { class: 'pie-toast pie-toast-' + (kind || 'info') },
      [String(message || '')]
    )
    stack.appendChild(t)
    requestAnimationFrame(() => t.classList.add('pie-toast-in'))
    setTimeout(() => {
      t.classList.remove('pie-toast-in')
      t.classList.add('pie-toast-out')
      setTimeout(() => t.remove(), 220)
    }, kind === 'error' ? 5500 : 3200)
  }

  // ===== Confirm =====
  function confirm(opts) {
    const o = opts || {}
    return new Promise((resolve) => {
      const root = ensureRoot()
      const back = el('div', { class: 'pie-modal-back', role: 'dialog', 'aria-modal': 'true' })
      const card = el('div', { class: 'pie-modal-card' }, [
        el('div', { class: 'pie-modal-title' }, [o.title || 'Confirm']),
        el('div', { class: 'pie-modal-body' }, [o.message || 'Are you sure?']),
        el('div', { class: 'pie-modal-actions' }, [
          el(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onclick: () => done(false)
            },
            [o.cancelLabel || 'Cancel']
          ),
          el(
            'button',
            {
              class:
                'btn ' + (o.tone === 'danger' ? 'btn-danger' : 'btn-primary') + ' btn-sm',
              type: 'button',
              onclick: () => done(true)
            },
            [o.confirmLabel || 'Confirm']
          )
        ])
      ])
      back.appendChild(card)
      root.appendChild(back)
      requestAnimationFrame(() => back.classList.add('pie-modal-in'))

      function done(ok) {
        back.classList.remove('pie-modal-in')
        setTimeout(() => back.remove(), 180)
        resolve(!!ok)
      }
      back.addEventListener('click', (e) => {
        if (e.target === back) done(false)
      })
      function escClose(e) {
        if (e.key === 'Escape') {
          done(false)
          window.removeEventListener('keydown', escClose)
        }
      }
      window.addEventListener('keydown', escClose)
    })
  }

  // ===== Drawer =====
  function drawer(opts) {
    const o = opts || {}
    const root = ensureRoot()
    const back = el('div', { class: 'pie-drawer-back', role: 'dialog', 'aria-modal': 'true' })
    const panel = el('aside', { class: 'pie-drawer-panel' })
    const header = el('header', { class: 'pie-drawer-header' }, [
      el('h2', { class: 'pie-drawer-title' }, [o.title || '']),
      el(
        'button',
        {
          class: 'pie-drawer-close',
          type: 'button',
          'aria-label': 'Close',
          onclick: () => close()
        },
        ['×']
      )
    ])
    const body = el('div', { class: 'pie-drawer-body' })
    if (typeof o.bodyHtml === 'string') body.innerHTML = o.bodyHtml
    if (o.bodyEl) body.appendChild(o.bodyEl)
    const footer = el('footer', { class: 'pie-drawer-footer' })
    const grip = el('div', {
      class: 'pie-drawer-resize-grip',
      title: 'Drag left or right to resize',
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize side panel'
    })
    let dragStartX = 0
    let dragStartW = 0
    function onGripMove(e) {
      const dx = dragStartX - e.clientX
      const next = Math.min(Math.max(280, dragStartW + dx), Math.floor(window.innerWidth * 0.92))
      panel.style.width = next + 'px'
    }
    function onGripUp() {
      document.removeEventListener('mousemove', onGripMove)
      document.removeEventListener('mouseup', onGripUp)
      document.removeEventListener('touchmove', onGripMoveTouch)
      document.removeEventListener('touchend', onGripUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    function onGripMoveTouch(e) {
      if (!e.touches || !e.touches[0]) return
      const fake = { clientX: e.touches[0].clientX }
      onGripMove(fake)
    }
    function startDrag(clientX) {
      dragStartX = clientX
      dragStartW = panel.getBoundingClientRect().width
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onGripMove)
      document.addEventListener('mouseup', onGripUp)
      document.addEventListener('touchmove', onGripMoveTouch, { passive: false })
      document.addEventListener('touchend', onGripUp)
    }
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startDrag(e.clientX)
    })
    grip.addEventListener('touchstart', (e) => {
      if (!e.touches || !e.touches[0]) return
      e.preventDefault()
      startDrag(e.touches[0].clientX)
    }, { passive: false })
    grip.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 16
      const w = panel.getBoundingClientRect().width
      if (e.key === 'ArrowLeft') {
        panel.style.width = Math.min(Math.floor(window.innerWidth * 0.92), w + step) + 'px'
      } else if (e.key === 'ArrowRight') {
        panel.style.width = Math.max(280, w - step) + 'px'
      }
    })
    panel.appendChild(grip)
    panel.appendChild(header)
    panel.appendChild(body)
    panel.appendChild(footer)
    back.appendChild(panel)
    root.appendChild(back)
    requestAnimationFrame(() => back.classList.add('pie-drawer-in'))

    function close() {
      back.classList.remove('pie-drawer-in')
      setTimeout(() => back.remove(), 200)
      if (typeof o.onClose === 'function') o.onClose()
    }
    back.addEventListener('click', (e) => {
      if (e.target === back) close()
    })
    function escClose(e) {
      if (e.key === 'Escape') {
        close()
        window.removeEventListener('keydown', escClose)
      }
    }
    window.addEventListener('keydown', escClose)

    return {
      panel,
      body,
      footer,
      close,
      setFooter: (nodes) => {
        footer.innerHTML = ''
        ;(Array.isArray(nodes) ? nodes : [nodes]).forEach((n) => n && footer.appendChild(n))
      }
    }
  }

  function btn(label, onClick, variant) {
    return el(
      'button',
      { class: 'btn btn-' + (variant || 'ghost') + ' btn-sm', type: 'button', onclick: onClick },
      [label]
    )
  }

  // ===== Skeleton =====
  function skeletonRows(cols, count) {
    const out = []
    for (let i = 0; i < (count || 4); i++) {
      const tds = []
      for (let c = 0; c < cols; c++) tds.push('<td><span class="pie-skel"></span></td>')
      out.push('<tr class="pie-skel-row">' + tds.join('') + '</tr>')
    }
    return out.join('')
  }

  window.PieUi = { toast, confirm, drawer, btn, el, skeletonRows }
})()
