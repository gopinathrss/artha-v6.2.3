// XIRR
export interface CashflowPoint {
  date: Date
  amount: number
}
export interface XIRRResult {
  value: number | null
  isEstimate: boolean
  note: string
  cashflowCount: number
}

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0
}

function yFracYears(date: Date, base: Date): number {
  return (date.getTime() - base.getTime()) / (365 * 86400000)
}

function npvAndDerivative(rateDecimal: number, flows: Array<{ amount: number; y: number }>): { npv: number; dnpv: number } {
  if (rateDecimal <= -0.9999) return { npv: Number.POSITIVE_INFINITY, dnpv: 0 }
  let npv = 0
  let dnpv = 0
  for (const { amount, y } of flows) {
    const denom = Math.pow(1 + rateDecimal, y)
    if (denom === 0 || !Number.isFinite(denom)) continue
    const t1 = amount / denom
    npv += t1
    dnpv -= (y * amount) / (denom * (1 + rateDecimal))
  }
  return { npv, dnpv }
}

function xirrFromRoot(
  flowTuples: Array<{ amount: number; y: number }>,
  initialGuess: number
): { rate: number } | null {
  let r = initialGuess
  for (let i = 0; i < 100; i++) {
    const { npv, dnpv } = npvAndDerivative(r, flowTuples)
    if (!Number.isFinite(npv) || !Number.isFinite(dnpv)) return null
    if (Math.abs(npv) < 1e-8) return { rate: r }
    if (Math.abs(dnpv) < 1e-14) break
    const next = r - npv / dnpv
    if (!Number.isFinite(next)) break
    if (next <= -0.999) {
      r = -0.5
      continue
    }
    r = next
  }

  const tryBisect = (lo: number, hi: number): { rate: number } | null => {
    const { npv: fLo } = npvAndDerivative(lo, flowTuples)
    const { npv: fHi } = npvAndDerivative(hi, flowTuples)
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null
    if (fLo * fHi > 0) return null
    let a = lo
    let b = hi
    let fa = fLo
    for (let k = 0; k < 200; k++) {
      const mid = (a + b) / 2
      const { npv: fm } = npvAndDerivative(mid, flowTuples)
      if (!Number.isFinite(fm)) return null
      if (Math.abs(fm) < 1e-9) return { rate: mid }
      if (fa * fm < 0) {
        b = mid
      } else {
        a = mid
        fa = fm
      }
    }
    return { rate: (a + b) / 2 }
  }

  return tryBisect(0, 5) || tryBisect(-0.9, 0) || tryBisect(-0.95, 5)
}

export function calculateXIRR(
  cashflows: CashflowPoint[],
  terminalDate: Date,
  terminalValue: number
): XIRRResult {
  const nonZero = cashflows.filter((c) => Math.abs(safeNum(c.amount)) > 1e-12)
  if (!Number.isFinite(terminalValue) || terminalValue === 0) {
    if (nonZero.length === 0) {
      return { value: null, isEstimate: true, note: 'no cashflows', cashflowCount: 0 }
    }
  }

  const byDay = new Map<string, { date: Date; amount: number }>()
  for (const c of nonZero) {
    const d = new Date(c.date)
    const k = d.toISOString().slice(0, 10)
    const prev = byDay.get(k)
    if (prev) prev.amount += safeNum(c.amount)
    else byDay.set(k, { date: d, amount: safeNum(c.amount) })
  }
  const merged: CashflowPoint[] = [...byDay.values()].map((v) => ({ date: v.date, amount: v.amount }))
  if (terminalValue !== 0 && Number.isFinite(terminalValue)) {
    const t = new Date(terminalDate)
    const kt = t.toISOString().slice(0, 10)
    const existing = merged.find((m) => m.date.toISOString().slice(0, 10) === kt)
    if (existing) existing.amount += safeNum(terminalValue)
    else merged.push({ date: t, amount: safeNum(terminalValue) })
  }

  merged.sort((a, b) => a.date.getTime() - b.date.getTime())

  const count = merged.length
  if (count < 2) {
    return { value: null, isEstimate: true, note: 'need cashflows + terminal', cashflowCount: count }
  }

  const base = merged[0].date
  const flowTuples = merged.map((m) => ({
    amount: m.amount,
    y: Math.max(0, yFracYears(m.date, base))
  }))

  const negativeAmt = merged.filter((m) => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0)
  const last = merged[merged.length - 1]
  const spanYears = yFracYears(last.date, base)
  if (spanYears < 0.5) {
    const inv = negativeAmt
    const monthsSpan = Math.max(
      1,
      Math.round((last.date.getTime() - base.getTime()) / (86400000 * (365 / 12)))
    )
    if (inv > 0) {
      const ratio = safeNum(last.amount) / inv
      if (Number.isFinite(ratio) && ratio > 0) {
        const est = (Math.pow(ratio, 12 / monthsSpan) - 1) * 100
        return { value: safeNum(est), isEstimate: true, note: 'annualized estimate', cashflowCount: count }
      }
    }
  }

  const { npv: npv0 } = npvAndDerivative(0, flowTuples)
  const { npv: npv5 } = npvAndDerivative(5, flowTuples)
  const { npv: npvNeg } = npvAndDerivative(-0.9, flowTuples)

  let hasBracket =
    Number.isFinite(npv0) &&
    Number.isFinite(npv5) &&
    npv0 * npv5 <= 0 &&
    (npv0 !== 0 || npv5 !== 0)
  if (!hasBracket && Number.isFinite(npvNeg) && Number.isFinite(npv0) && npvNeg * npv0 <= 0) {
    hasBracket = true
  }

  if (!hasBracket) {
    const hasOutflow = merged.some((m) => m.amount < 0)
    const hasInflow = merged.some((m) => m.amount > 0)
    if (!hasOutflow || !hasInflow) {
      return { value: null, isEstimate: true, note: 'no sign change in cashflows', cashflowCount: count }
    }
    const inv = merged.filter((m) => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0)
    const last = merged[merged.length - 1]
    const monthsSpan = Math.max(
      1,
      Math.round((last.date.getTime() - merged[0].date.getTime()) / (86400000 * (365.25 / 12)))
    )
    if (inv <= 0) {
      return { value: null, isEstimate: true, note: 'no invested base', cashflowCount: count }
    }
    const ratio = safeNum(last.amount) / inv
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return { value: null, isEstimate: true, note: 'invalid terminal ratio', cashflowCount: count }
    }
    const est = (Math.pow(ratio, 12 / monthsSpan) - 1) * 100
    return {
      value: safeNum(est),
      isEstimate: true,
      note: 'annualized estimate',
      cashflowCount: count
    }
  }

  const resolved = xirrFromRoot(flowTuples, 0.1)
  if (!resolved) {
    const inv = negativeAmt
    const last = merged[merged.length - 1]
    const monthsSpan = Math.max(
      1,
      Math.round((last.date.getTime() - merged[0].date.getTime()) / (86400000 * (365.25 / 12)))
    )
    if (inv <= 0) return { value: null, isEstimate: true, note: 'non-convergent', cashflowCount: count }
    const ratio = safeNum(last.amount) / inv
    const est = (Math.pow(Math.max(ratio, 1e-9), 12 / monthsSpan) - 1) * 100
    return { value: safeNum(est), isEstimate: true, note: 'annualized estimate', cashflowCount: count }
  }

  return {
    value: safeNum(resolved.rate * 100),
    isEstimate: false,
    note: '',
    cashflowCount: count
  }
}

// NET WORTH
export interface FXRates {
  EURCZK: number
  EURINR: number
}
export interface NetWorthResult {
  totalCzk: number
  totalEur: number
  czechFundsCzk: number
  czechSavingsCzk: number
  czechPensionCzk: number
  indiaNRECzk: number
  indiaNROCzk: number
  indiaFDCzk: number
  indiaTotal: number
  czechTotal: number
  gainCzk: number
  gainPct: number
  fxRatesUsed: FXRates
  calculatedAt: Date
}

function accountToCzk(
  a: { type: string; balanceLocal: number; balanceCzk: number; currency: string },
  fx: FXRates
): number {
  const cur = (a.currency || 'CZK').toUpperCase()
  const local = safeNum(a.balanceLocal)
  if (cur === 'CZK') return local
  if (cur === 'EUR') return local * safeNum(fx.EURCZK)
  if (cur === 'INR') return local * (safeNum(fx.EURCZK) / safeNum(fx.EURINR))
  return local
}

export function calculateNetWorth(
  holdings: any[],
  accounts: any[],
  totalInvested: number,
  fxRates: FXRates
): NetWorthResult {
  const eczk = safeNum(fxRates.EURCZK) || 0
  const einr = safeNum(fxRates.EURINR) || 0
  const fx: FXRates = { EURCZK: eczk || 0, EURINR: einr || 0 }
  const now = new Date()

  let czechFundsCzk = 0
  for (const h of holdings) {
    if (h?.status === 'EXITED') continue
    czechFundsCzk += safeNum(h?.currentValueCzk)
  }

  let czechSavingsCzk = 0
  let czechPensionCzk = 0
  let indiaNRECzk = 0
  let indiaNROCzk = 0
  let indiaFDCzk = 0

  for (const a of accounts || []) {
    if (a?.isActive === false) continue
    const t = String(a?.type || '').toUpperCase()
    const czk = accountToCzk(
      {
        type: t,
        balanceLocal: safeNum(a?.balanceLocal),
        balanceCzk: safeNum(a?.balanceCzk),
        currency: (a?.currency || 'CZK') as string
      },
      fx
    )
    if (t === 'SAVINGS') czechSavingsCzk += czk
    else if (t === 'PENSION') czechPensionCzk += czk
    else if (t === 'NRE') indiaNRECzk += czk
    else if (t === 'NRO') indiaNROCzk += czk
    else if (t === 'FIXED_DEPOSIT') indiaFDCzk += czk
  }

  const czechTotal = czechFundsCzk + czechSavingsCzk + czechPensionCzk
  const indiaTotal = indiaNRECzk + indiaNROCzk + indiaFDCzk
  const totalCzk = czechTotal + indiaTotal
  const totalEur = eczk > 0 ? totalCzk / eczk : 0
  const inv = safeNum(totalInvested)
  const gainCzk = totalCzk - inv
  const gainPct = inv === 0 ? 0 : (gainCzk / inv) * 100

  return {
    totalCzk: safeNum(totalCzk),
    totalEur: safeNum(totalEur),
    czechFundsCzk: safeNum(czechFundsCzk),
    czechSavingsCzk: safeNum(czechSavingsCzk),
    czechPensionCzk: safeNum(czechPensionCzk),
    indiaNRECzk: safeNum(indiaNRECzk),
    indiaNROCzk: safeNum(indiaNROCzk),
    indiaFDCzk: safeNum(indiaFDCzk),
    indiaTotal: safeNum(indiaTotal),
    czechTotal: safeNum(czechTotal),
    gainCzk: safeNum(gainCzk),
    gainPct: safeNum(gainPct),
    fxRatesUsed: { EURCZK: eczk, EURINR: einr },
    calculatedAt: now
  }
}

// ALLOCATION
export interface AllocationResult {
  equityPct: number
  bondsPct: number
  cashPct: number
  equityCzk: number
  bondsCzk: number
  cashCzk: number
  equityGap: number
  bondsGap: number
  cashGap: number
}

function mapCategoryToBuckets(category: string): { eq: number; bd: number; ca: number } {
  const c = String(category || 'MIXED').toUpperCase()
  if (c === 'EQUITY' || c === 'COMMODITY') return { eq: 1, bd: 0, ca: 0 }
  if (c === 'BONDS') return { eq: 0, bd: 1, ca: 0 }
  if (c === 'CASH') return { eq: 0, bd: 0, ca: 1 }
  if (c === 'MIXED') return { eq: 0.5, bd: 0.5, ca: 0 }
  return { eq: 1, bd: 0, ca: 0 }
}

function normalize3(eq: number, bd: number, ca: number): { eq: number; bd: number; ca: number } {
  const t = Math.max(0, eq) + Math.max(0, bd) + Math.max(0, ca)
  if (t <= 0) return { eq: 0, bd: 0, ca: 0 }
  let e = (Math.max(0, eq) / t) * 100
  let b = (Math.max(0, bd) / t) * 100
  let c = 100 - e - b
  c = safeNum(c)
  const sum = e + b + c
  if (Math.abs(sum - 100) > 1e-3) {
    c = 100 - e - b
  }
  return { eq: e, bd: b, ca: c }
}

export function calculateAllocation(
  holdings: any[],
  targetEquity: number,
  targetBonds: number,
  targetCash: number
): AllocationResult {
  const te = safeNum(targetEquity)
  const tb = safeNum(targetBonds)
  const tc = safeNum(targetCash)
  let equityCzk = 0
  let bondsCzk = 0
  let cashCzk = 0
  for (const h of holdings || []) {
    if (h?.status !== 'ACTIVE') continue
    const v = safeNum(h?.currentValueCzk)
    const w = mapCategoryToBuckets(h?.category)
    equityCzk += v * w.eq
    bondsCzk += v * w.bd
    cashCzk += v * w.ca
  }
  const tval = equityCzk + bondsCzk + cashCzk
  if (tval <= 0) {
    return {
      equityPct: 0,
      bondsPct: 0,
      cashPct: 0,
      equityCzk: 0,
      bondsCzk: 0,
      cashCzk: 0,
      equityGap: te,
      bondsGap: tb,
      cashGap: tc
    }
  }
  const n = normalize3(equityCzk, bondsCzk, cashCzk)
  return {
    equityPct: n.eq,
    bondsPct: n.bd,
    cashPct: n.ca,
    equityCzk: safeNum(equityCzk),
    bondsCzk: safeNum(bondsCzk),
    cashCzk: safeNum(cashCzk),
    equityGap: safeNum(te - n.eq),
    bondsGap: safeNum(tb - n.bd),
    cashGap: safeNum(tc - n.ca)
  }
}

// HEALTH SCORE
export interface HealthResult {
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  confidence: number
}

function gradeFromScore(s: number): 'A' | 'B' | 'C' | 'D' {
  if (s >= 80) return 'A'
  if (s >= 65) return 'B'
  if (s >= 50) return 'C'
  return 'D'
}

export function calculateHealth(
  holdings: any[],
  accounts: any[],
  snapshots: any[],
  fxRatesAge: number
): HealthResult {
  const active = (holdings || []).filter((h) => h && h.status === 'ACTIVE')
  const withSip = active.filter((h) => safeNum(h.monthlySipCzk) > 0)
  const consistency = active.length === 0 ? 0 : 30 * (withSip.length / active.length)

  let gainPct = 0
  if (snapshots && snapshots.length > 0) {
    const sorted = [...snapshots].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    gainPct = safeNum(sorted[0]?.gainPct)
  }
  const growth = Math.max(0, Math.min(25, ((Math.max(-100, Math.min(100, gainPct)) + 20) / 80) * 25))

  const cats = new Set(active.map((h) => String(h?.category || '')))
  const diversification = Math.min(20, active.length * 1.2 + Math.max(0, cats.size) * 2.5)

  const alloc = calculateAllocation(holdings || [], 65, 25, 10)
  const gap = Math.sqrt(
    alloc.equityGap * alloc.equityGap + alloc.bondsGap * alloc.bondsGap + alloc.cashGap * alloc.cashGap
  )
  const goalAlignment = Math.max(0, Math.min(15, 15 * (1 - Math.min(1, gap / 50))))

  const dataQuality = Math.max(0, Math.min(10, 10 - (fxRatesAge > 48 ? 6 : fxRatesAge > 24 ? 3 : 0)))

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(consistency + growth + diversification + goalAlignment + dataQuality)
    )
  )

  const conf = calculateConfidence(
    computeHoldingsPriceAgeHours(holdings || []),
    fxRatesAge,
    0,
    (snapshots || []).length
  )
  return { score, grade: gradeFromScore(score), confidence: conf }
}

export function projectFutureValue(
  currentValueCzk: number,
  annualReturnPct: number,
  years: number,
  monthlySipCzk: number
): number {
  const r = safeNum(annualReturnPct) / 100 / 12
  const n = Math.round(safeNum(years) * 12)
  const c = safeNum(currentValueCzk)
  const m = safeNum(monthlySipCzk)
  if (n <= 0) return Math.round(c)
  if (r === 0) return Math.round(c + m * n)
  const g = Math.pow(1 + r, n)
  return Math.round(c * g + m * (g - 1) / r)
}

export function calculateRequiredSIP(
  currentValueCzk: number,
  goalCzk: number,
  annualReturnPct: number,
  years: number
): number {
  const r = safeNum(annualReturnPct) / 100 / 12
  const n = Math.round(safeNum(years) * 12)
  const c = safeNum(currentValueCzk)
  const gTarget = safeNum(goalCzk)
  if (n <= 0) return Math.max(0, Math.round(gTarget - c))
  if (r === 0) return Math.max(0, Math.round((gTarget - c) / n))
  const g = Math.pow(1 + r, n)
  return Math.max(0, Math.round((gTarget - c * g) * r / (g - 1)))
}

export function calculateTaxStatus(holding: any, today: Date) {
  const tax = new Date(holding.taxFreeDate)
  const days = Math.round((tax.getTime() - today.getTime()) / 86400000)
  return {
    isTaxFree: days <= 0,
    daysUntilTaxFree: days,
    taxFreeDate: tax,
    urgency: days <= 0 ? 'FREE' : days <= 30 ? 'CRITICAL' : days <= 60 ? 'HIGH' : 'FUTURE'
  }
}

/** Hours since the stalest `updatedAt` among ACTIVE holdings (NAV/position refresh proxy). */
export function computeHoldingsPriceAgeHours(
  holdings: Array<{ status?: string | null; updatedAt?: Date | null }>
): number {
  const active = (holdings || []).filter(
    (h) => h && h.status === 'ACTIVE' && h.updatedAt != null
  ) as Array<{ updatedAt: Date }>
  if (active.length === 0) return 0
  let oldestMs = Infinity
  for (const h of active) {
    const t = new Date(h.updatedAt).getTime()
    if (t < oldestMs) oldestMs = t
  }
  if (!Number.isFinite(oldestMs)) return 0
  return Math.max(0, (Date.now() - oldestMs) / 3600000)
}

export function calculateConfidence(
  priceAgeHours: number,
  fxAgeHours: number,
  holdingsWithMissingDates: number,
  monthsOfHistory: number
): number {
  let score = 100
  if (priceAgeHours > 72) score -= 20
  else if (priceAgeHours > 24) score -= 10
  if (fxAgeHours > 48) score -= 15
  else if (fxAgeHours > 24) score -= 8
  score -= (holdingsWithMissingDates || 0) * 5
  if (monthsOfHistory < 3) score -= 15
  else if (monthsOfHistory < 6) score -= 8
  return Math.max(0, Math.min(100, score))
}
