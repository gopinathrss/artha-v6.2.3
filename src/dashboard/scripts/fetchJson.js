/**
 * V6 centralized fetch helper.
 *
 *  - Same-origin cookies by default (works with the dashboard auth gate).
 *  - Timeout via AbortController (default 25s, override per call).
 *  - 401  → automatic redirect to /login.html?next=<current>.
 *  - 5xx  → small retry-on-network/5xx with backoff.
 *  - Returns parsed JSON; throws Error('http <status>: <body>') on !ok.
 *
 * Exposed as window.PieFetch.{json, get, post, patch, delete}.
 */
;(function () {
  const DEFAULT_TIMEOUT = 25_000
  const DEFAULT_RETRIES = 1

  function buildAbort(ms) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), ms)
    return { signal: ctl.signal, cancel: () => clearTimeout(timer) }
  }

  async function once(url, opts) {
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT
    const ab = buildAbort(timeoutMs)
    try {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.headers || {})
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: opts.credentials || 'same-origin',
        cache: opts.cache || 'no-store',
        signal: ab.signal
      })
      const ct = res.headers.get('content-type') || ''
      const isJson = ct.includes('application/json')
      const payload = isJson ? await res.json().catch(() => null) : await res.text()
      if (res.status === 401 && opts.redirectOn401 !== false) {
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = '/login.html?next=' + next
        return new Promise(() => {})
      }
      if (!res.ok) {
        const detail =
          payload && typeof payload === 'object' && payload.error
            ? payload.error
            : typeof payload === 'string'
              ? payload.slice(0, 240)
              : res.statusText
        const err = new Error('http ' + res.status + ': ' + detail)
        err.status = res.status
        err.payload = payload
        throw err
      }
      return payload
    } finally {
      ab.cancel()
    }
  }

  async function json(url, opts) {
    opts = opts || {}
    const retries = typeof opts.retries === 'number' ? opts.retries : DEFAULT_RETRIES
    let lastErr = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await once(url, opts)
      } catch (e) {
        lastErr = e
        const status = e && e.status
        const transient = !status || status >= 500
        const isAbort = e && e.name === 'AbortError'
        if (!transient || isAbort || attempt === retries) throw e
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
      }
    }
    throw lastErr
  }

  window.PieFetch = {
    json,
    get: (url, opts) => json(url, { ...(opts || {}), method: 'GET' }),
    post: (url, body, opts) => json(url, { ...(opts || {}), method: 'POST', body }),
    patch: (url, body, opts) => json(url, { ...(opts || {}), method: 'PATCH', body }),
    put: (url, body, opts) => json(url, { ...(opts || {}), method: 'PUT', body }),
    delete: (url, opts) => json(url, { ...(opts || {}), method: 'DELETE' })
  }
})()
