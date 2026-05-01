import { getPrisma } from './prisma'

const AMFI_URL = 'https://www.amfiindia.com/spages/NAVAll.txt'

const ISIN_RE = /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/

function asOfDateIndia(): Date {
  const s = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [y, m, d] = s.slice(0, 10).split('-').map((x) => parseInt(x, 10))
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
}

/**
 * Best-effort parse of a NAVAll.txt line: semicolon-separated; ISIN and NAV vary by section.
 * Returns one row if an ISIN and a plausible NAV (₹) are found.
 */
export function tryParseAmfiLine(line: string): { isin: string; nav: number } | null {
  const t = line.trim()
  if (!t || t.length < 12) return null
  if (!t.includes(';')) return null
  const low = t.toLowerCase()
  if (low.startsWith('open ended') || low.startsWith('close ended') || low.startsWith('scheme')) {
    return null
  }
  const parts = t.split(';').map((s) => s.trim())
  let isin: string | null = null
  for (const p of parts) {
    if (ISIN_RE.test(p)) {
      isin = p
      break
    }
  }
  if (!isin) return null
  const nums: number[] = []
  for (const p of parts) {
    if (p === isin) continue
    const n = parseFloat(String(p).replace(/,/g, ''))
    if (isFinite(n) && n > 0.0001 && n < 1e7) {
      nums.push(n)
    }
  }
  if (nums.length === 0) return null
  const nav = nums[nums.length - 1]
  if (nav < 0.01 || nav > 1e6) return null
  return { isin, nav: Math.round(nav * 1e6) / 1e6 }
}

/**
 * Download AMFI NAVAll and insert into NavHistory (as-of = India calendar “today” UTC).
 * Capped to protect DB on first import.
 */
export async function ingestAmfiNavAll(options?: { maxRows?: number }): Promise<{
  ok: boolean
  lines: number
  parsed: number
  inserted: number
  asOf: string
  error?: string
}> {
  const prisma = await getPrisma()
  const maxRows = options?.maxRows ?? 20_000
  const asOf = asOfDateIndia()
  let text: string
  try {
    const r = await fetch(AMFI_URL, {
      headers: { 'User-Agent': 'ARTHA/1.0 (personal CFO)' }
    })
    if (!r.ok) {
      return { ok: false, lines: 0, parsed: 0, inserted: 0, asOf: asOf.toISOString(), error: `HTTP ${r.status}` }
    }
    text = await r.text()
  } catch (e) {
    const m = e instanceof Error ? e.message : 'fetch failed'
    return { ok: false, lines: 0, parsed: 0, inserted: 0, asOf: asOf.toISOString(), error: m }
  }
  const lines = text.split(/\r?\n/)
  const byIsin = new Map<string, { isin: string; nav: number }>()
  for (const line of lines) {
    if (byIsin.size >= maxRows) break
    const p = tryParseAmfiLine(line)
    if (!p) continue
    byIsin.set(p.isin, p)
  }
  const rows: { isin: string; date: Date; nav: number; currency: string; source: string }[] = []
  for (const p of byIsin.values()) {
    rows.push({
      isin: p.isin,
      date: asOf,
      nav: p.nav,
      currency: 'INR',
      source: 'AMFI_NAVAll'
    })
  }
  let inserted = 0
  const batch = 500
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    const r = await prisma.navHistory.createMany({ data: chunk, skipDuplicates: true })
    inserted += r.count
  }
  try {
    await prisma.systemHealth.create({
      data: {
        checkName: 'AMFI_NAV_INGEST',
        status: 'PASS',
        message: `NAVAll parsed=${rows.length} inserted=${inserted} asOf=${asOf.toISOString()}`,
        lastSuccessful: new Date()
      }
    })
  } catch {
    // optional
  }
  return {
    ok: true,
    lines: lines.length,
    parsed: rows.length,
    inserted,
    asOf: asOf.toISOString()
  }
}
