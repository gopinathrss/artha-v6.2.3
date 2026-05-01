/**
 * /intelligence — V5 rebuild (Ask Artha chat).
 *
 * POST /api/intelligence/ask {question} → response with aiResponse + keyNumbers.
 * GET  /api/intelligence/history       → prior memories (questions/answers).
 *
 * The conversation is in-memory (page-local); persisted memories appear in
 * the History card below.
 */
;(function () {
  'use strict'

  const QUICK = [
    'What should I do this month?',
    'Can I retire by age 50?',
    'Where am I leaking money?',
    'Should I buy a flat or keep investing?',
    'What is the best ETF for my equity allocation?',
    'How does my NRE money compare to Czech investing?'
  ]

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function whenStr(s) {
    if (!s) return ''
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const win = document.getElementById('chat-window')
  const input = document.getElementById('chat-input')
  const send = document.getElementById('chat-send')
  const sug = document.getElementById('chat-suggestions')

  function renderSuggestions() {
    sug.innerHTML = QUICK.map(
      (q) => `<button class="chip" type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`
    ).join('')
    sug.querySelectorAll('[data-q]').forEach((c) => {
      c.addEventListener('click', () => {
        input.value = c.getAttribute('data-q') || ''
        input.focus()
      })
    })
  }

  function appendMsg(role, text) {
    const div = document.createElement('div')
    div.className = role === 'user' ? 'chat-msg chat-msg-user' : 'chat-msg chat-msg-assistant'
    div.innerHTML = String(text || '')
      .split('\n')
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('')
    win.appendChild(div)
    win.scrollTop = win.scrollHeight
  }

  function appendThinking() {
    const div = document.createElement('div')
    div.className = 'chat-msg chat-msg-assistant'
    div.id = 'chat-thinking'
    div.innerHTML = '<span class="text-tertiary">Thinking…</span>'
    win.appendChild(div)
    win.scrollTop = win.scrollHeight
  }

  function removeThinking() {
    document.getElementById('chat-thinking')?.remove()
  }

  async function ask() {
    const q = (input.value || '').trim()
    if (!q) return
    input.value = ''
    send.disabled = true
    appendMsg('user', q)
    appendThinking()

    try {
      const res = await fetch('/api/intelligence/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      }).then((r) => r.json())

      removeThinking()

      const ans = res?.data?.aiResponse || res?.data?.answer || res?.data?.response
      if (ans) {
        appendMsg('assistant', ans)
      } else if (res?.error || res?.success === false) {
        appendMsg(
          'assistant',
          'Sorry — could not answer that. ' + (res?.error || 'Unknown error')
        )
      } else {
        appendMsg('assistant', 'No response received.')
      }

      await loadHistory()
    } catch (e) {
      removeThinking()
      appendMsg('assistant', 'Network error: ' + (e?.message || e))
    } finally {
      send.disabled = false
    }
  }

  async function loadHistory() {
    const sub = document.getElementById('history-subtitle')
    const list = document.getElementById('history-list')
    sub.textContent = 'Loading…'
    let memories = []
    try {
      const res = await fetch('/api/intelligence/history').then((r) => r.json())
      memories = res?.data?.memories || []
    } catch {}

    if (memories.length === 0) {
      sub.textContent = 'No prior questions'
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-message">Ask Artha a question to start a history.</div>
        </div>
      `
      return
    }

    sub.textContent =
      memories.length + ' ' + (memories.length === 1 ? 'memory' : 'memories') +
      ' · most recent first'

    list.innerHTML = memories
      .slice(0, 20)
      .map((m) => {
        const date = m.sessionDate || m.createdAt
        return `
          <div class="alert-row">
            <div class="alert-row-dot info"></div>
            <div>
              <div class="alert-row-title">${escapeHtml(m.questionAsked || m.question || 'Question')}</div>
              <div class="alert-row-meta">${escapeHtml(m.questionType || '')}${date ? ' · ' + escapeHtml(whenStr(date)) : ''}</div>
            </div>
            <div></div>
          </div>
        `
      })
      .join('')
  }

  renderSuggestions()
  loadHistory()

  send.addEventListener('click', ask)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      ask()
    }
  })
})()
