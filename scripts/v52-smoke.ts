/**
 * Quick HTTP checks for V5.2 + core APIs (run against a running server).
 * Usage: npm run v52-smoke
 * Env: ARTHA_SMOKE_BASE (default http://127.0.0.1:3002)
 */
const base = (process.env.ARTHA_SMOKE_BASE || 'http://127.0.0.1:3002').replace(/\/$/, '')

async function get(path: string, expectJson = true): Promise<{ ok: boolean; status: number; snippet: string }> {
  const url = base + path
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await r.text()
  let snippet = text.slice(0, 200)
  if (expectJson && r.ok) {
    try {
      const j = JSON.parse(text) as { success?: boolean }
      snippet = JSON.stringify({ success: j.success, keys: j && typeof j === 'object' ? Object.keys(j).slice(0, 8) : [] })
    } catch {
      snippet = 'non-json: ' + snippet
    }
  }
  return { ok: r.ok, status: r.status, snippet }
}

async function main() {
  const checks: Array<{ name: string; path: string; json?: boolean }> = [
    { name: 'healthz', path: '/healthz', json: false },
    { name: 'app-settings theme', path: '/api/app-settings/theme' },
    { name: 'app-settings', path: '/api/app-settings' },
    { name: 'integrations', path: '/api/integrations' },
    { name: 'settings (legacy)', path: '/api/settings' },
    { name: 'health', path: '/api/health' }
  ]

  let failed = 0
  for (const c of checks) {
    const expectJson = c.json !== false
    const res = await get(c.path, expectJson)
    const pass = res.ok
    const line = `${pass ? 'OK' : 'FAIL'} ${c.name} ${c.path} → ${res.status} ${res.snippet}`
    console.log(line)
    if (!pass) failed++
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed. Is the server up? Base URL: ${base}`)
    process.exit(1)
  }
  console.log('\nAll smoke checks passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
