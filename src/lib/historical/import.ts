import { Decimal } from '@prisma/client/runtime/library'
import { realPrisma as prisma } from '../prismaProvider'

export interface ImportSummary {
  isin: string
  source: string
  dailyRows: number
  monthlyRows: number
  oldestDate: string | null
  errors: string[]
}

const DAILY_CUTOFF_YEARS = 3
const MONTHLY_HISTORY_YEARS = 10

const KNOWN_YAHOO: Record<string, string> = {
  IE00B4L5Y983: 'SWDA.L',
  IE00BK5BQT80: 'VWCE.DE',
  IE00B3XXRP09: 'VUSA.L',
  IE00B5BMR087: 'IGLN.L',
  IE00B3F81409: 'IHYG.L',
  IE00BDBRDM35: 'AGGG.L'
}

async function isinToYahooTicker(isin: string): Promise<string | null> {
  if (KNOWN_YAHOO[isin]) return KNOWN_YAHOO[isin]
  const lib = await prisma.instrumentLibrary.findUnique({ where: { isin } })
  if (lib?.ticker) return lib.ticker.replace(/^LSE:/, '').trim()
  return null
}

async function fetchYahooDaily(isin: string): Promise<Array<{ date: Date; nav: number }>> {
  const ticker = await isinToYahooTicker(isin)
  if (!ticker) throw new Error(`No Yahoo ticker for ${isin}`)
  const period1 = Math.floor((Date.now() - MONTHLY_HISTORY_YEARS * 365 * 86400000) / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ARTHA/5)' } })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const json = (await res.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> }
  }
  const result = json.chart?.result?.[0]
  if (!result) throw new Error('No Yahoo data')
  const timestamps: number[] = result.timestamp || []
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []
  return timestamps
    .map((t, i) => ({
      date: new Date(t * 1000),
      nav: closes[i] as number
    }))
    .filter((r) => r.nav != null && Number.isFinite(r.nav))
}

async function fetchAmfiHistorical(_isin: string): Promise<Array<{ date: Date; nav: number }>> {
  return []
}

function navValueAtOrBefore(
  navs: Array<{ date: Date; nav: Decimal }>,
  target: Date
): { nav: number; date: Date } | null {
  let best: { date: Date; nav: number } | null = null
  for (const n of navs) {
    if (n.date.getTime() <= target.getTime()) {
      best = { date: n.date, nav: Number(n.nav) }
    } else break
  }
  return best
}

export async function computeStats(isin: string): Promise<void> {
  const navs = await prisma.historicalNavSummary.findMany({
    where: { isin },
    orderBy: { date: 'asc' }
  })
  if (navs.length < 2) return

  const today = new Date()
  const numNavs = navs.map((n) => ({ date: n.date, nav: Number(n.nav) }))

  const stats: {
    isin: string
    asOfDate: Date
    dataPointCount: number
    oldestDate: Date
    cagr1y?: Decimal
    cagr3y?: Decimal
    cagr5y?: Decimal
    cagr10y?: Decimal
    maxDrawdown1y?: Decimal
    maxDrawdown3y?: Decimal
    maxDrawdown5y?: Decimal
    maxDrawdownAll?: Decimal
    volatility1y?: Decimal
    sharpe3y?: Decimal
    recoveryMonths: number | null
  } = {
    isin,
    asOfDate: today,
    dataPointCount: navs.length,
    oldestDate: navs[0]!.date,
    recoveryMonths: null
  }

  const cagrForYears = (years: number): Decimal | undefined => {
    const cutoff = new Date(today.getFullYear() - years, today.getMonth(), today.getDate())
    const startPt = navValueAtOrBefore(navs, cutoff)
    const endPt = numNavs[numNavs.length - 1]!
    if (!startPt || startPt.nav <= 0 || endPt.nav <= 0) return undefined
    const ratio = endPt.nav / startPt.nav
    const cagr = (Math.pow(ratio, 1 / years) - 1) * 100
    if (!Number.isFinite(cagr)) return undefined
    return new Decimal(cagr.toFixed(4))
  }

  stats.cagr1y = cagrForYears(1)
  stats.cagr3y = cagrForYears(3)
  stats.cagr5y = cagrForYears(5)
  stats.cagr10y = cagrForYears(10)

  const cutoff1y = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  const cutoff3y = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
  const cutoff5y = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())

  let peakAll = 0
  let maxDDAll = 0
  let maxDDStartIdx = 0
  let maxDD1y = 0
  let maxDD3y = 0
  let maxDD5y = 0

  for (let i = 0; i < numNavs.length; i++) {
    const v = numNavs[i]!.nav
    const d = numNavs[i]!.date
    if (v > peakAll) peakAll = v
    if (peakAll <= 0) continue
    const dd = ((peakAll - v) / peakAll) * 100
    if (dd > maxDDAll) {
      maxDDAll = dd
      maxDDStartIdx = i
    }
    if (d >= cutoff1y && dd > maxDD1y) maxDD1y = dd
    if (d >= cutoff3y && dd > maxDD3y) maxDD3y = dd
    if (d >= cutoff5y && dd > maxDD5y) maxDD5y = dd
  }

  if (maxDDStartIdx > 0 && maxDDStartIdx < numNavs.length - 1) {
    const peakBeforeDD = Math.max(...numNavs.slice(0, maxDDStartIdx + 1).map((n) => n.nav))
    for (let i = maxDDStartIdx + 1; i < numNavs.length; i++) {
      if (numNavs[i]!.nav >= peakBeforeDD) {
        const monthsDiff =
          (numNavs[i]!.date.getTime() - numNavs[maxDDStartIdx]!.date.getTime()) / (30 * 86400000)
        stats.recoveryMonths = Math.round(monthsDiff)
        break
      }
    }
  }

  stats.maxDrawdown1y = new Decimal(maxDD1y.toFixed(4))
  stats.maxDrawdown3y = new Decimal(maxDD3y.toFixed(4))
  stats.maxDrawdown5y = new Decimal(maxDD5y.toFixed(4))
  stats.maxDrawdownAll = new Decimal(maxDDAll.toFixed(4))

  const daily1y = navs.filter((n) => n.date >= cutoff1y && n.resolution === 'DAILY')
  if (daily1y.length > 30) {
    const returns: number[] = []
    for (let i = 1; i < daily1y.length; i++) {
      const prev = Number(daily1y[i - 1]!.nav)
      const cur = Number(daily1y[i]!.nav)
      if (prev > 0) returns.push((cur - prev) / prev)
    }
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
    const dailyVol = Math.sqrt(variance)
    const annualVol = dailyVol * Math.sqrt(252) * 100
    stats.volatility1y = new Decimal(annualVol.toFixed(4))
    if (dailyVol > 0) {
      const annualReturn = mean * 252
      const sharpe = (annualReturn - 0.02) / (dailyVol * Math.sqrt(252))
      stats.sharpe3y = new Decimal(sharpe.toFixed(4))
    }
  }

  const row = {
    isin,
    asOfDate: stats.asOfDate,
    cagr1y: stats.cagr1y ?? null,
    cagr3y: stats.cagr3y ?? null,
    cagr5y: stats.cagr5y ?? null,
    cagr10y: stats.cagr10y ?? null,
    maxDrawdown1y: stats.maxDrawdown1y ?? null,
    maxDrawdown3y: stats.maxDrawdown3y ?? null,
    maxDrawdown5y: stats.maxDrawdown5y ?? null,
    maxDrawdownAll: stats.maxDrawdownAll ?? null,
    volatility1y: stats.volatility1y ?? null,
    sharpe3y: stats.sharpe3y ?? null,
    recoveryMonths: stats.recoveryMonths,
    dataPointCount: stats.dataPointCount,
    oldestDate: stats.oldestDate,
    computedAt: new Date()
  }

  await prisma.historicalNavStats.upsert({
    where: { isin },
    create: row,
    update: row
  })
}

export async function importHistoricalNavs(
  isin: string,
  source: 'ERSTE' | 'YAHOO' | 'AMFI'
): Promise<ImportSummary> {
  const result: ImportSummary = { isin, source, dailyRows: 0, monthlyRows: 0, oldestDate: null, errors: [] }

  let raw: Array<{ date: Date; nav: number }> = []
  try {
    if (source === 'YAHOO') raw = await fetchYahooDaily(isin)
    else if (source === 'ERSTE') {
      const { fetchErsteHistoricalNavs: fe } = await import('../nav/erste')
      const holding = await prisma.holding.findFirst({ where: { isin, status: { not: 'EXITED' } } })
      const notationId = holding?.navSourceId
      if (!notationId) {
        result.errors.push(`No navSourceId (Erste notation) for ${isin}`)
        return result
      }
      raw = await fe(notationId)
    } else if (source === 'AMFI') raw = await fetchAmfiHistorical(isin)
  } catch (e: unknown) {
    result.errors.push(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    return result
  }

  if (raw.length === 0) {
    result.errors.push('No data returned')
    return result
  }

  raw.sort((a, b) => a.date.getTime() - b.date.getTime())
  const today = new Date()
  const dailyCutoff = new Date(today.getFullYear() - DAILY_CUTOFF_YEARS, today.getMonth(), today.getDate())
  const monthlyCutoff = new Date(today.getFullYear() - MONTHLY_HISTORY_YEARS, today.getMonth(), today.getDate())

  const dailyRows: typeof raw = []
  const monthlyMap = new Map<string, { date: Date; nav: number }>()

  for (const r of raw) {
    if (r.date < monthlyCutoff) continue
    if (r.date >= dailyCutoff) {
      dailyRows.push(r)
    } else {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`
      const existing = monthlyMap.get(key)
      if (!existing || r.date > existing.date) monthlyMap.set(key, r)
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.historicalNavSummary.deleteMany({ where: { isin } })

    const chunk = 400
    const dailyData = dailyRows.map((d) => ({
      isin,
      date: d.date,
      nav: new Decimal(d.nav),
      resolution: 'DAILY',
      source
    }))
    for (let i = 0; i < dailyData.length; i += chunk) {
      await tx.historicalNavSummary.createMany({ data: dailyData.slice(i, i + chunk) })
    }
    const monthData = [...monthlyMap.values()].map((m) => ({
      isin,
      date: m.date,
      nav: new Decimal(m.nav),
      resolution: 'MONTHLY',
      source
    }))
    for (let i = 0; i < monthData.length; i += chunk) {
      await tx.historicalNavSummary.createMany({ data: monthData.slice(i, i + chunk) })
    }
  })

  result.dailyRows = dailyRows.length
  result.monthlyRows = monthlyMap.size
  result.oldestDate = raw[0]?.date.toISOString().slice(0, 10) ?? null

  await computeStats(isin)
  return result
}

export async function importAllHistoricalNavs(): Promise<{ processed: number; errors: string[] }> {
  const holdings = await prisma.holding.findMany({ where: { status: { not: 'EXITED' } } })
  const library = await prisma.instrumentLibrary.findMany()
  const isins = new Set<string>()
  for (const h of holdings) isins.add(h.isin)
  for (const l of library) isins.add(l.isin)
  const errors: string[] = []
  let processed = 0
  for (const isin of isins) {
    const source: 'ERSTE' | 'YAHOO' = isin.startsWith('CZ') ? 'ERSTE' : 'YAHOO'
    const r = await importHistoricalNavs(isin, source)
    if (r.errors.length) errors.push(`${isin}: ${r.errors.join('; ')}`)
    else processed++
  }
  return { processed, errors }
}
