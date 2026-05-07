export type StrategyInput = {
  holding: {
    id: string
    isin: string
    name: string
    category: string // 'EQUITY' | 'BONDS' | 'CASH' (+ others tolerated)
    currentValueCzk: number
    costBasisCzk: number
    monthlySipCzk: number
    purchaseStartDate: Date
    taxFreeDate: Date | null
    status: string
  }
  backtestStats: {
    cagrPct5yr: number | null
    maxDrawdownPct: number | null
    sharpeRatio: number | null
    recoveryMonths: number | null
    /** NAV sample count when stats row exists (months or points per importer). */
    dataPointCount?: number | null
    /** True when row exists but sample too small for meaningful CAGR/Sharpe. */
    isTruncated?: boolean
  } | null
  libraryScore: {
    score: number | null
    terPct: number | null
    fundSizeM: number | null
    availableInGeorge: boolean
  } | null
  profile: {
    riskProfile: string // 'Conservative' | 'Moderate' | 'Aggressive' (case-insensitive tolerated)
    targetEquityPct: number
    targetBondsPct: number
    targetCashPct: number
    monthlyInvestable: number
    retirementAge: number
    currentAge: number
  }
  currentAllocation: {
    equityPct: number
    bondsPct: number
    cashPct: number
    totalCzk: number
  }
}

export type StrategyProposal = {
  holdingId: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  allocationPct: number
  allocationSleeve: 'equity' | 'bonds' | 'cash'
  absoluteCapCzk: number
  monthlySipCzk: number
  monthsToTarget: number
  reviewDate: Date
  profitCapPct: number
  profitCapCzk: number
  drawdownGuardrailPct: number
  drawdownHistoricalMax: number | null
  taxFreeDate: Date | null
  preferTaxFreeExit: boolean
  proposalReasoning: string
  keyMetrics: Record<string, unknown>
}

// ── Area 2: Sell decision engine types ───────────────────────────────────
export type CrossCheckResult = {
  name: string
  input: string
  result: 'OVERRIDE' | 'CONFIRM' | 'NEUTRAL'
  note: string
}

export type SignalEvaluation = {
  signalType: 'TAX' | 'ALLOCATION' | 'PROFIT_CAP' | 'DRAWDOWN'
  fired: boolean
  strength: 'STRONG_SELL' | 'SOFT_SELL' | 'REVIEW' | 'HOLD' | 'WARNING'
  rawValue: number | null
  threshold: number | null
  crossChecks: CrossCheckResult[]
  reasoning: string
  // Optional signal-specific extras (e.g., profit cap adjustment recommendation)
  meta?: Record<string, unknown>
}

export type SellDecision = {
  holdingId: string
  strategyId: string
  overallStrength: 'STRONG_SELL' | 'SOFT_SELL' | 'REVIEW' | 'HOLD' | 'WARNING'
  primarySignal: 'DRAWDOWN' | 'TAX' | 'PROFIT_CAP' | 'ALLOCATION' | 'NONE'
  signals: SignalEvaluation[]
  reasoning: string
  recommendedAction: 'SELL_NOW' | 'PLAN_SELL' | 'REVIEW' | 'HOLD' | 'WATCH'
  urgencyDays: number | null
  estimatedTaxCzk: number | null
  shouldNotify: boolean
}

export type HoldingSnapshot = {
  holdingId: string
  isin: string
  name: string
  currentValueCzk: number
  costBasisCzk: number
  peakValueCzk: number
  gainPct: number
  drawdownFromPeak: number
  currentAllocationPct: number
  taxFreeDate: Date | null
  daysUntilTaxFree: number | null
  isTaxFree: boolean
  category: string
}

export type SignalContext = {
  totalPortfolioCzk: number
  allHoldingsByCategory: Record<string, number>
  riskProfile: string
  backtestStats: { cagrPct5yr: number | null; maxDrawdownPct: number | null; sharpeRatio: number | null; recoveryMonths?: number | null } | null
  peerAverageCagrPct: number | null
  // For cross-checks where a “sell now” would cause allocation distortion
  targetSleevePct?: number | null
  currentSleevePct?: number | null
}

