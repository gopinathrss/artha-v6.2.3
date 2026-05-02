/**
 * End-to-end API smoke (requires server on PORT, default 3002).
 * Usage: node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/full-smoke.ts
 */
const BASE = `http://127.0.0.1:${process.env.PORT || '3002'}`

interface CheckResult {
  name: string
  passed: boolean
  detail: string
}
const results: CheckResult[] = []

async function check(name: string, fn: () => Promise<boolean | string>) {
  try {
    const r = await fn()
    if (r === true) results.push({ name, passed: true, detail: 'OK' })
    else if (typeof r === 'string') results.push({ name, passed: false, detail: r })
    else results.push({ name, passed: false, detail: 'returned false' })
  } catch (e: unknown) {
    results.push({ name, passed: false, detail: e instanceof Error ? e.message : String(e) })
  }
}

async function main() {
  await check('healthz', async () => {
    const r = await fetch(`${BASE}/healthz`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/health', async () => {
    const r = await fetch(`${BASE}/api/health`)
    const j = (await r.json()) as { data?: { checks?: unknown[] } }
    const n = j?.data?.checks?.length ?? 0
    return n >= 12 || `only ${n} checks`
  })
  await check('api/overview', async () => {
    const r = await fetch(`${BASE}/api/overview`)
    const j = (await r.json()) as { data?: { holdings?: unknown[] } }
    const n = j?.data?.holdings?.length ?? 0
    return n >= 11 || `only ${n} holdings`
  })
  await check('api/this-month', async () => {
    const r = await fetch(`${BASE}/api/this-month`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/holdings', async () => {
    const r = await fetch(`${BASE}/api/holdings`)
    const j = (await r.json()) as { data?: { holdings?: unknown[] } }
    const n = j?.data?.holdings?.length ?? 0
    return (r.ok && n >= 11) || (!r.ok ? `HTTP ${r.status}` : `only ${n} holdings`)
  })
  await check('api/india/mf', async () => {
    const r = await fetch(`${BASE}/api/india/mf`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/alerts', async () => {
    const r = await fetch(`${BASE}/api/alerts`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/library', async () => {
    const r = await fetch(`${BASE}/api/library`)
    const j = (await r.json()) as { data?: { instruments?: unknown[] } }
    const n = j?.data?.instruments?.length ?? 0
    return n >= 25 || `only ${n} library entries`
  })
  await check('api/patterns', async () => {
    const r = await fetch(`${BASE}/api/patterns`)
    const j = (await r.json()) as { data?: unknown[] }
    const n = Array.isArray(j?.data) ? j.data.length : 0
    return n >= 60 || `only ${n} patterns`
  })
  await check('api/cron/recent', async () => {
    const r = await fetch(`${BASE}/api/cron/recent`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/outcomes/summary', async () => {
    const r = await fetch(`${BASE}/api/outcomes/summary`)
    return r.ok || `HTTP ${r.status}`
  })
  await check('api/backtest/run real CAGR', async () => {
    const r = await fetch(`${BASE}/api/backtest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: 'ALL_EQUITY_VWCE',
        startDate: '2023-01-01',
        endDate: '2026-04-30',
        initialValueCzk: 100000
      })
    })
    const j = (await r.json()) as { data?: { cagr?: number } }
    return Math.abs(j?.data?.cagr ?? 0) > 0.01 || `cagr=${j?.data?.cagr}`
  })
  await check('api/reports/generate', async () => {
    const r = await fetch(`${BASE}/api/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'MONTHLY' })
    })
    const j = (await r.json()) as { data?: { html?: string } }
    const len = j?.data?.html?.length ?? 0
    return len > 1000 || `html len ${len}`
  })
  await check('demo isolation', async () => {
    const sR = await fetch(`${BASE}/api/settings`)
    const s = (await sR.json()) as { data?: { settings?: { demoModeEnabled?: boolean } } }
    if (s?.data?.settings?.demoModeEnabled === false) return true
    return 'demo currently active — check manually'
  })

  // eslint-disable-next-line no-console
  console.log('\n=== ARTHA V5 FULL SMOKE TEST ===\n')
  let pass = 0
  let fail = 0
  for (const r of results) {
    const icon = r.passed ? '\u2713' : '\u2717'
    // eslint-disable-next-line no-console
    console.log(`  ${icon} ${r.name}: ${r.detail}`)
    if (r.passed) pass++
    else fail++
  }
  // eslint-disable-next-line no-console
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
