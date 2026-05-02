import { getPrisma } from '../prisma'

export type BacktestStrategyKind = 'CURRENT_PORTFOLIO' | 'ALL_EQUITY_VWCE' | 'CUSTOM'

export interface BacktestConfig {
  strategy: BacktestStrategyKind
  holdings?: Array<{ isin: string; weightPct: number }>
  startDate: Date
  endDate: Date
  initialValueCzk: number
  rebalanceFrequencyDays?: number
  monthlySipCzk?: number
}

export interface BacktestResult {
  monthlyValues: Array<{ date: string; valueCzk: number }>
  cagr: number
  maxDrawdown: number
  sharpe: number | null
  totalContributedCzk: number
  finalValueCzk: number
  warnings: string[]
}

export function getNavOnOrBefore(
  navs: Array<{ date: Date; nav: number }>,
  target: Date
): number | null {
  let result: number | null = null
  for (const n of navs) {
    if (n.date <= target) result = n.nav
    else break
  }
  return result
}

/** First point if target is before series start (Tier-2 window may start mid-series). */
function navForValuation(navs: Array<{ date: Date; nav: number }>, target: Date): number | null {
  if (navs.length === 0) return null
  if (target.getTime() < navs[0]!.date.getTime()) return navs[0]!.nav
  return getNavOnOrBefore(navs, target)
}

/** Stable JSON for 24h cache matching (POST /api/backtest/run). */
export function backtestConfigFingerprint(c: BacktestConfig): string {
  const h = (c.holdings || [])
    .map((x) => ({ isin: x.isin, weightPct: Math.round(x.weightPct * 1000) / 1000 }))
    .sort((a, b) => a.isin.localeCompare(b.isin))
  return JSON.stringify({
    strategy: c.strategy,
    start: c.startDate.toISOString().slice(0, 10),
    end: c.endDate.toISOString().slice(0, 10),
    initial: Math.round(c.initialValueCzk),
    sip: Math.round(c.monthlySipCzk ?? 0),
    reb: c.rebalanceFrequencyDays ?? 0,
    holdings: h
  })
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const prisma = await getPrisma()
  const warnings: string[] = []
  let holdings: Array<{ isin: string; weightPct: number }> = []

  if (config.strategy === 'CURRENT_PORTFOLIO') {
    const real = await prisma.holding.findMany({ where: { status: 'ACTIVE' } })
    const total = real.reduce((s, h) => s + Number(h.currentValueCzk), 0)
    holdings = real
      .filter((h) => Number(h.currentValueCzk) > 0)
      .map((h) => ({
        isin: h.isin,
        weightPct: total > 0 ? (Number(h.currentValueCzk) / total) * 100 : 0
      }))
    if (holdings.length === 0) {
      warnings.push('No ACTIVE holdings with value > 0 — flat performance at initial capital')
    }
  } else if (config.strategy === 'ALL_EQUITY_VWCE') {
    holdings = [{ isin: 'IE00BK5BQT80', weightPct: 100 }]
  } else {
    holdings = config.holdings ?? []
    const sumW = holdings.reduce((s, h) => s + h.weightPct, 0)
    if (holdings.length > 0 && Math.abs(sumW - 100) > 0.5) {
      warnings.push(`CUSTOM weights sum to ${sumW.toFixed(1)}% (expected ~100%)`)
    }
  }

  if (holdings.length === 0) {
    const initial = Math.max(0, config.initialValueCzk)
    const monthlyValues: Array<{ date: string; valueCzk: number }> = []
    const cur = new Date(config.startDate.getFullYear(), config.startDate.getMonth(), 1)
    while (cur <= config.endDate) {
      monthlyValues.push({ date: cur.toISOString().slice(0, 10), valueCzk: Math.round(initial) })
      cur.setMonth(cur.getMonth() + 1)
    }
    return {
      monthlyValues,
      cagr: 0,
      maxDrawdown: 0,
      sharpe: null,
      totalContributedCzk: initial,
      finalValueCzk: initial,
      warnings
    }
  }

  const navData = new Map<string, Array<{ date: Date; nav: number }>>()
  const skippedIsins = new Set<string>()
  for (const h of holdings) {
    const navs = await prisma.historicalNavSummary.findMany({
      where: {
        isin: h.isin,
        date: { gte: config.startDate, lte: config.endDate }
      },
      orderBy: { date: 'asc' }
    })
    if (navs.length < 2) {
      warnings.push(
        `Insufficient Tier-2 historical NAVs for ${h.isin} in selected period — holding excluded (import historical data first)`
      )
      skippedIsins.add(h.isin)
      continue
    }
    navData.set(
      h.isin,
      navs.map((n) => ({ date: new Date(n.date), nav: Number(n.nav) }))
    )
  }

  holdings = holdings.filter((h) => !skippedIsins.has(h.isin))
  const wsum = holdings.reduce((s, h) => s + h.weightPct, 0)
  if (holdings.length > 0 && wsum > 0 && Math.abs(wsum - 100) > 0.01) {
    holdings = holdings.map((h) => ({ ...h, weightPct: (h.weightPct / wsum) * 100 }))
  }

  if (holdings.length === 0) {
    const initial = Math.max(0, config.initialValueCzk)
    const monthlyValues: Array<{ date: string; valueCzk: number }> = []
    const cur = new Date(config.startDate.getFullYear(), config.startDate.getMonth(), 1)
    while (cur <= config.endDate) {
      monthlyValues.push({ date: cur.toISOString().slice(0, 10), valueCzk: Math.round(initial) })
      cur.setMonth(cur.getMonth() + 1)
    }
    return {
      monthlyValues,
      cagr: 0,
      maxDrawdown: 0,
      sharpe: null,
      totalContributedCzk: initial,
      finalValueCzk: initial,
      warnings
    }
  }

  const monthlyValues: Array<{ date: string; valueCzk: number }> = []
  const cur = new Date(config.startDate.getFullYear(), config.startDate.getMonth(), 1)
  const endDate = config.endDate
  const initial = Math.max(0, config.initialValueCzk)
  let totalContributed = initial
  const sip = Math.max(0, config.monthlySipCzk ?? 0)
  const rebFreq = config.rebalanceFrequencyDays ?? 0

  const units = new Map<string, number>()
  for (const h of holdings) {
    const series = navData.get(h.isin) || []
    const navAtStart = navForValuation(series, cur) ?? 1
    const allocCzk = (initial * h.weightPct) / 100
    units.set(h.isin, navAtStart > 0 ? allocCzk / navAtStart : 0)
  }

  let lastRebalance = new Date(cur.getTime())

  function portfolioValue(at: Date): number {
    let v = 0
    for (const h of holdings) {
      const nav = navForValuation(navData.get(h.isin) || [], at) ?? 0
      v += (units.get(h.isin) || 0) * nav
    }
    return v
  }

  while (cur <= endDate) {
    let value = portfolioValue(cur)

    if (sip > 0) {
      totalContributed += sip
      for (const h of holdings) {
        const nav = navForValuation(navData.get(h.isin) || [], cur) ?? 1
        const sipCzk = (sip * h.weightPct) / 100
        const addUnits = nav > 0 ? sipCzk / nav : 0
        units.set(h.isin, (units.get(h.isin) || 0) + addUnits)
      }
      value = portfolioValue(cur)
    }

    monthlyValues.push({ date: cur.toISOString().slice(0, 10), valueCzk: Math.round(value) })

    if (rebFreq > 0) {
      const daysSince = (cur.getTime() - lastRebalance.getTime()) / 86_400_000
      if (daysSince >= rebFreq) {
        const totalV = portfolioValue(cur)
        for (const h of holdings) {
          const nav = navForValuation(navData.get(h.isin) || [], cur) ?? 1
          const targetCzk = (totalV * h.weightPct) / 100
          units.set(h.isin, nav > 0 ? targetCzk / nav : 0)
        }
        lastRebalance = new Date(cur.getTime())
      }
    }

    cur.setMonth(cur.getMonth() + 1)
  }

  const finalValue =
    monthlyValues.length > 0 ? monthlyValues[monthlyValues.length - 1]!.valueCzk : initial
  const ms = config.endDate.getTime() - config.startDate.getTime()
  const years = ms / (365.25 * 86_400_000)
  const cagr =
    totalContributed > 0 && years > 0 && finalValue > 0
      ? (Math.pow(finalValue / totalContributed, 1 / years) - 1) * 100
      : 0

  let peak = 0
  let maxDD = 0
  for (const m of monthlyValues) {
    if (m.valueCzk > peak) peak = m.valueCzk
    const dd = peak > 0 ? ((peak - m.valueCzk) / peak) * 100 : 0
    if (dd > maxDD) maxDD = dd
  }

  const returns: number[] = []
  for (let i = 1; i < monthlyValues.length; i++) {
    const prev = monthlyValues[i - 1]!.valueCzk
    const curV = monthlyValues[i]!.valueCzk
    if (prev > 0) returns.push((curV - prev) / prev)
  }
  const meanRet = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length
    : 0
  const std = Math.sqrt(variance)
  const sharpe = std > 0 ? (meanRet * 12) / (std * Math.sqrt(12)) : null

  return {
    monthlyValues,
    cagr,
    maxDrawdown: maxDD,
    sharpe,
    totalContributedCzk: totalContributed,
    finalValueCzk: finalValue,
    warnings
  }
}
