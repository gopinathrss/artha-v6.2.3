/**
 * /intelligence — V5 rebuild (Ask PIE chat).
 *
 * POST /api/intelligence/ask {question} → { data: { memory: AIMemory, cached? } }; text is memory.aiResponse.
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

  /** Strip ```json fences and parse Ask PIE JSON shape (answer, topAction, followUp, keyNumbers). */
  function parseAssistantPayload(raw) {
    let s = String(raw || '').trim()
    const fenced = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i.exec(s)
    if (fenced) s = fenced[1].trim()
    else if (s.startsWith('```')) {
      s = s.replace(/^```[a-z0-9_-]*\s*\r?\n?/i, '').replace(/\r?\n?```\s*$/i, '').trim()
    }
    if (!s.startsWith('{')) return null
    const start = s.indexOf('{')
    let depth = 0
    let end = -1
    for (let i = start; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) return null
    try {
      return JSON.parse(s.slice(start, end + 1))
    } catch {
      return null
    }
  }

  function paragraphsToHtml(text) {
    return String(text || '')
      .split(/\n{2,}|\n/)
      .filter((p) => p.trim().length)
      .map((p) => `<p class="chat-answer-p">${escapeHtml(p.trim())}</p>`)
      .join('')
  }

  /** Rich assistant bubble when API returns JSON (or legacy rows stored as raw JSON). */
  function appendAssistantFromMemory(mem) {
    const div = document.createElement('div')
    div.className = 'chat-msg chat-msg-assistant chat-msg-rich'
    const raw = String((mem && (mem.aiResponse || mem.answer)) || '').trim()
    const j = parseAssistantPayload(raw)
    const rec = mem && mem.recommendations && typeof mem.recommendations === 'object' ? mem.recommendations : {}
    const topFromRec = typeof rec.topAction === 'string' ? rec.topAction : ''
    const fuFromRec = Array.isArray(rec.followUp) ? rec.followUp.filter((x) => typeof x === 'string') : []

    if (j && typeof j === 'object') {
      const answer =
        typeof j.answer === 'string'
          ? j.answer
          : typeof j.response === 'string'
            ? j.response
            : typeof j.content === 'string'
              ? j.content
              : ''
      const topAction = typeof j.topAction === 'string' ? j.topAction : topFromRec
      const followUp = Array.isArray(j.followUp) ? j.followUp.filter((x) => typeof x === 'string') : fuFromRec
      const conf = j.confidence != null && Number.isFinite(Number(j.confidence)) ? Number(j.confidence) : null
      const keyNumbers = Array.isArray(j.keyNumbers) ? j.keyNumbers : Array.isArray(mem.keyNumbers) ? mem.keyNumbers : []

      let metricsHtml = ''
      if (keyNumbers.length) {
        const rows = keyNumbers
          .map((row) => {
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              return Object.entries(row)
                .map(([k, v]) => `<span class="chat-kv"><span class="chat-k">${escapeHtml(k)}</span> ${escapeHtml(String(v))}</span>`)
                .join(' ')
            }
            return `<span class="chat-kv">${escapeHtml(JSON.stringify(row))}</span>`
          })
          .join('')
        metricsHtml = `<div class="chat-metrics">${rows}</div>`
      }

      const followHtml =
        followUp.length > 0
          ? `<ul class="chat-followup">${followUp.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`
          : ''

      div.innerHTML = `
        <div class="chat-answer-rich">
          ${answer ? `<div class="chat-answer-main">${paragraphsToHtml(answer)}</div>` : `<p class="text-tertiary">No answer text.</p>`}
          ${topAction ? `<div class="chat-top-action"><span class="chat-top-label">Top action</span> ${escapeHtml(topAction)}</div>` : ''}
          ${followHtml}
          ${metricsHtml}
          ${conf != null ? `<div class="chat-meta">Confidence: ${escapeHtml(String(conf))}%</div>` : ''}
        </div>`
    } else {
      div.innerHTML = raw
        .split('\n')
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join('')
    }
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

      const mem = res?.data?.memory
      const ans =
        (mem && (mem.aiResponse || mem.answer)) ||
        res?.data?.aiResponse ||
        res?.data?.answer ||
        res?.data?.response
      if (mem && (mem.aiResponse != null || mem.answer != null)) {
        appendAssistantFromMemory(mem)
      } else if (ans) {
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
          <div class="empty-state-message">Ask PIE a question to start a history.</div>
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

  async function loadTrackRecordCallout() {
    const el = document.getElementById('track-record-callout')
    if (!el) return
    try {
      const res = await fetch('/api/outcomes/summary').then((r) => r.json())
      const d = res?.data || {}
      const adh = d.followedPct != null ? `${d.followedPct}%` : '—'
      const avg =
        d.avgGainFollowed90d != null && Number.isFinite(Number(d.avgGainFollowed90d))
          ? `${Number(d.avgGainFollowed90d).toFixed(1)}%`
          : '—'
      el.style.display = 'block'
      el.innerHTML = `<strong>PIE’s recent track record:</strong> ${escapeHtml(adh)} adherence on evaluated rows · ${escapeHtml(
        avg
      )} avg 90d gain (followed). See <a href="/reports#track-record">Reports → Track record</a> for detail.`
    } catch {
      el.style.display = 'none'
    }
  }

  renderSuggestions()
  loadTrackRecordCallout()
  loadHistory()

  send.addEventListener('click', ask)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      ask()
    }
  })
})()
