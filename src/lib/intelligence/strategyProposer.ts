import type { StrategyInput, StrategyProposal } from './types'

const DRAWDOWN_GUARDRAIL: Record<string, number> = {
  CONSERVATIVE: 15,
  MODERATE: 20,
  AGGRESSIVE: 30
}

const BASE_PROFIT_CAP_PCT: Record<string, number> = {
  CONSERVATIVE: 25,
  MODERATE: 35,
  AGGRESSIVE: 50
}

function safeNum(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : 0
}

function roundTo(n: number, step: number): number {
  if (step <= 0) return Math.round(n)
  return Math.round(n / step) * step
}

function determineConfidence(input: StrategyInput): 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasBacktest =
    input.backtestStats?.cagrPct5yr != null &&
    input.backtestStats?.maxDrawdownPct != null &&
    input.backtestStats?.sharpeRatio != null
  const hasLibrary = input.libraryScore?.score != null
  if (hasBacktest && hasLibrary) return 'HIGH'
  if (hasLibrary) return 'MEDIUM'
  return 'LOW'
}

function sleeveFromCategory(category: string): 'equity' | 'bonds' | 'cash' {
  const c = String(category || '').toUpperCase()
  if (c === 'BONDS') return 'bonds'
  if (c === 'CASH') return 'cash'
  return 'equity'
}

function deriveMonthlySip(input: StrategyInput, sleeveGapPp: number): number {
  const monthlyInvestable = safeNum(input.profile.monthlyInvestable)
  const urgencyFactor = sleeveGapPp > 20 ? 0.6 : sleeveGapPp > 10 ? 0.4 : 0.2
  return Math.max(0, roundTo(monthlyInvestable * urgencyFactor, 500))
}

function deriveMonthsToTarget(currentValueCzk: number, absoluteCapCzk: number, monthlySip: number): number {
  const remaining = safeNum(absoluteCapCzk) - safeNum(currentValueCzk)
  if (remaining <= 0) return 3
  if (monthlySip <= 0) return 24
  return Math.max(1, Math.ceil(remaining / monthlySip))
}

function deriveAbsoluteCapCzk(input: StrategyInput, allocationPct: number, monthsToTargetHint: number): number {
  const currentTotal = safeNum(input.currentAllocation.totalCzk)
  const projectedTotal = currentTotal + safeNum(input.profile.monthlyInvestable) * Math.max(0, monthsToTargetHint)
  return Math.max(0, roundTo(projectedTotal * (safeNum(allocationPct) / 100), 1000))
}

function deriveProfitCapCzk(absoluteCapCzk: number, profitCapPct: number): number {
  return Math.max(0, roundTo(safeNum(absoluteCapCzk) * (1 + safeNum(profitCapPct) / 100), 1000))
}

function adjustProfitCapPct(base: number, cagrPct5yr: number | null | undefined): number {
  let profitCapPct = base
  if (cagrPct5yr != null && Number.isFinite(cagrPct5yr) && cagrPct5yr > 10) {
    const bonus = Math.min(15, (cagrPct5yr - 10) * 2)
    profitCapPct = base + bonus
  }
  return Math.max(5, Math.min(95, profitCapPct))
}

function decidePreferTaxFreeExit(taxFreeDate: Date | null, monthsToTarget: number): boolean {
  if (!taxFreeDate) return false
  const monthsToTaxFree = (taxFreeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.4)
  return monthsToTaxFree <= monthsToTarget + 12
}

export function proposeStrategy(input: StrategyInput): StrategyProposal {
  const { holding, backtestStats, libraryScore, profile, currentAllocation } = input
  const confidence = determineConfidence(input)

  const sleeveLower = sleeveFromCategory(holding.category)
  const targetSleevePct =
    sleeveLower === 'equity'
      ? safeNum(profile.targetEquityPct)
      : sleeveLower === 'bonds'
        ? safeNum(profile.targetBondsPct)
        : safeNum(profile.targetCashPct)
  const currentSleevePct =
    sleeveLower === 'equity'
      ? safeNum(currentAllocation.equityPct)
      : sleeveLower === 'bonds'
        ? safeNum(currentAllocation.bondsPct)
        : safeNum(currentAllocation.cashPct)
  const sleeveGapPp = Math.max(0, targetSleevePct - currentSleevePct)

  const allocationPct = libraryScore?.score != null ? Math.min(60, Math.max(20, Math.round(safeNum(libraryScore.score) / 2))) : 30

  const monthsHint = Math.min(24, Math.max(6, Math.ceil(sleeveGapPp / 2)))
  const monthlySip = deriveMonthlySip(input, sleeveGapPp)
  const absoluteCapCzk = deriveAbsoluteCapCzk(input, allocationPct, monthsHint)
  const monthsToTarget = deriveMonthsToTarget(holding.currentValueCzk, absoluteCapCzk, monthlySip)

  const reviewDate = new Date()
  reviewDate.setMonth(reviewDate.getMonth() + monthsToTarget)

  const rp = String(profile.riskProfile || 'MODERATE').toUpperCase()
  const drawdownGuardrailPct = DRAWDOWN_GUARDRAIL[rp] ?? 20

  const baseProfitCapPct = BASE_PROFIT_CAP_PCT[rp] ?? 35
  const profitCapPct = adjustProfitCapPct(baseProfitCapPct, backtestStats?.cagrPct5yr ?? null)
  const profitCapCzk = deriveProfitCapCzk(absoluteCapCzk, profitCapPct)

  const taxFreeDate = holding.taxFreeDate
  const preferTaxFreeExit = decidePreferTaxFreeExit(taxFreeDate, monthsToTarget)

  const reasoningParts: string[] = []
  reasoningParts.push(`${holding.name} — ${confidence} confidence strategy proposal.`)

  if (backtestStats?.cagrPct5yr != null) {
    reasoningParts.push(
      `Backtest (5yr): CAGR ${safeNum(backtestStats.cagrPct5yr).toFixed(1)}%, max drawdown ${safeNum(
        backtestStats.maxDrawdownPct
      ).toFixed(1)}%, Sharpe ${safeNum(backtestStats.sharpeRatio).toFixed(2)}, recovery ${
        backtestStats.recoveryMonths ?? '?'
      } months.`
    )
  } else {
    reasoningParts.push(`No backtest history available — strategy uses library score and profile only. Confidence is ${confidence}.`)
  }

  if (libraryScore?.score != null) {
    reasoningParts.push(
      `Library score: ${safeNum(libraryScore.score)}/100. TER: ${
        libraryScore.terPct != null ? safeNum(libraryScore.terPct).toFixed(2) : '?'
      }% p.a. Fund size: ${libraryScore.fundSizeM != null ? String(libraryScore.fundSizeM) + 'M EUR' : 'unknown'}.`
    )
  }

  reasoningParts.push(
    `Sleeve allocation: ${sleeveLower} (target ${targetSleevePct.toFixed(1)}%, current ${currentSleevePct.toFixed(
      1
    )}%, gap ${sleeveGapPp.toFixed(1)}pp). This fund allocated ${allocationPct}% of ${sleeveLower} sleeve.`
  )

  reasoningParts.push(
    `Buy plan: ${Math.round(monthlySip).toLocaleString('cs-CZ')} Kč/month for ~${monthsToTarget} months. Target position: ${Math.round(
      absoluteCapCzk
    ).toLocaleString('cs-CZ')} Kč. Review date: ${reviewDate.toLocaleDateString('cs-CZ')}.`
  )

  reasoningParts.push(
    `Profit caps: +${profitCapPct.toFixed(0)}% gain OR ${Math.round(profitCapCzk).toLocaleString('cs-CZ')} Kč (whichever first). Soft signal — PIE reviews before recommending sell.`
  )

  reasoningParts.push(
    `Drawdown guardrail: -${drawdownGuardrailPct}% from cost basis. ${
      backtestStats?.maxDrawdownPct != null
        ? `Historical max drawdown: ${safeNum(backtestStats.maxDrawdownPct).toFixed(1)}%. RISK_SELL fires only if drawdown exceeds historical max.`
        : 'No historical max available — guardrail uses risk profile only.'
    }`
  )

  if (taxFreeDate) {
    const months = Math.ceil((taxFreeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.4))
    reasoningParts.push(
      `Tax calendar: Czech 3-year tax-free exit available ${taxFreeDate.toLocaleDateString('cs-CZ')} (~${months} months). ${
        preferTaxFreeExit
          ? 'PIE will prefer tax-free exit unless forward projection is negative.'
          : 'Tax-free date is beyond strategy horizon — will not wait for it.'
      }`
    )
  }

  const keyMetrics: Record<string, unknown> = {
    cagrPct5yr: backtestStats?.cagrPct5yr ?? null,
    maxDrawdownPct: backtestStats?.maxDrawdownPct ?? null,
    sharpeRatio: backtestStats?.sharpeRatio ?? null,
    recoveryMonths: backtestStats?.recoveryMonths ?? null,
    libraryScore: libraryScore?.score ?? null,
    terPct: libraryScore?.terPct ?? null,
    sleeveGapPp,
    riskProfile: profile.riskProfile,
    confidence,
    generatedAt: new Date().toISOString()
  }

  return {
    holdingId: holding.id,
    confidence,
    allocationPct,
    allocationSleeve: sleeveLower,
    absoluteCapCzk,
    monthlySipCzk: monthlySip,
    monthsToTarget,
    reviewDate,
    profitCapPct,
    profitCapCzk,
    drawdownGuardrailPct,
    drawdownHistoricalMax: backtestStats?.maxDrawdownPct ?? null,
    taxFreeDate,
    preferTaxFreeExit,
    proposalReasoning: reasoningParts.join(' '),
    keyMetrics
  }
}

