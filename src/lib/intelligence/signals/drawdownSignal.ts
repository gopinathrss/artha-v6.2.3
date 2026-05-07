import type { HoldingSnapshot, SignalContext, SignalEvaluation } from '../types'

export type FundStrategyRow = {
  drawdownGuardrailPct: { toString(): string } | number
  drawdownHistoricalMax: { toString(): string } | number | null
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number((v as any)?.toString?.() ?? v)
  return Number.isFinite(x) ? x : 0
}

export function evaluateDrawdownSignal(
  snapshot: HoldingSnapshot,
  strategy: FundStrategyRow,
  context: SignalContext
): SignalEvaluation {
  const guardrailPct = n(strategy.drawdownGuardrailPct)
  const historicalMaxPct = strategy.drawdownHistoricalMax != null ? n(strategy.drawdownHistoricalMax) : null
  const currentDrawdown = Math.max(0, n(snapshot.drawdownFromPeak))

  const cc: SignalEvaluation['crossChecks'] = []

  if (guardrailPct <= 0) {
    return {
      signalType: 'DRAWDOWN',
      fired: false,
      strength: 'HOLD',
      rawValue: currentDrawdown,
      threshold: null,
      crossChecks: [],
      reasoning: 'No drawdown guardrail configured.'
    }
  }

  const warnFloor = guardrailPct * 0.5
  if (currentDrawdown < warnFloor) {
    return {
      signalType: 'DRAWDOWN',
      fired: false,
      strength: 'HOLD',
      rawValue: currentDrawdown,
      threshold: warnFloor,
      crossChecks: [],
      reasoning: `Drawdown ${currentDrawdown.toFixed(1)}% (normal).`
    }
  }

  if (currentDrawdown < guardrailPct) {
    return {
      signalType: 'DRAWDOWN',
      fired: true,
      strength: 'WARNING',
      rawValue: currentDrawdown,
      threshold: guardrailPct,
      crossChecks: [],
      reasoning: `Drawdown ${currentDrawdown.toFixed(1)}% approaching guardrail ${guardrailPct.toFixed(1)}%.`
    }
  }

  // Zone C: guardrail hit — cross-check.
  let riskSell = true
  if (historicalMaxPct != null) {
    if (currentDrawdown < historicalMaxPct) {
      cc.push({
        name: 'historical_norms',
        input: `current=${currentDrawdown.toFixed(1)}%, historicalMax=${historicalMaxPct.toFixed(1)}%`,
        result: 'OVERRIDE',
        note: 'Within historical max drawdown — likely normal behavior.'
      })
      riskSell = false
    } else {
      cc.push({
        name: 'historical_norms',
        input: `current=${currentDrawdown.toFixed(1)}%, historicalMax=${historicalMaxPct.toFixed(1)}%`,
        result: 'CONFIRM',
        note: 'Exceeds historical max drawdown — abnormal behavior.'
      })
      riskSell = true
    }
  } else {
    cc.push({
      name: 'historical_norms',
      input: 'historicalMax=null',
      result: 'NEUTRAL',
      note: 'No historical max available — guardrail treated as hard stop.'
    })
    riskSell = true
  }

  let strength: SignalEvaluation['strength'] = riskSell ? 'STRONG_SELL' : 'REVIEW'

  // Cross-check: tax proximity tempering.
  if (riskSell && snapshot.daysUntilTaxFree != null && snapshot.daysUntilTaxFree <= 90 && !snapshot.isTaxFree) {
    cc.push({
      name: 'tax_proximity',
      input: `${snapshot.daysUntilTaxFree} days to tax-free`,
      result: 'OVERRIDE',
      note: 'Very close to tax-free — present as tempered sell vs hold-through.'
    })
    strength = 'SOFT_SELL'
  }

  // Cross-check: recovery pattern tempering.
  const recM = context.backtestStats?.recoveryMonths ?? null
  if (riskSell && recM != null && recM <= 12) {
    cc.push({
      name: 'recovery_pattern',
      input: `recoveryMonths=${recM}`,
      result: 'OVERRIDE',
      note: `Historically recovers in ${recM} months — consider holding instead of panic sell.`
    })
    if (strength === 'STRONG_SELL') strength = 'SOFT_SELL'
  }

  // Rare STRONG_SELL: only if abnormal and no tempering checks fired.
  return {
    signalType: 'DRAWDOWN',
    fired: true,
    strength,
    rawValue: currentDrawdown,
    threshold: historicalMaxPct ?? guardrailPct,
    crossChecks: cc,
    reasoning:
      strength === 'REVIEW'
        ? `Drawdown ${currentDrawdown.toFixed(1)}% hit guardrail but within historical norms — review only.`
        : strength === 'SOFT_SELL'
          ? `Drawdown ${currentDrawdown.toFixed(1)}% hit guardrail — sell suggested but tempered by cross-checks.`
          : `Abnormal drawdown ${currentDrawdown.toFixed(1)}% — exceeds historical max; risk sell.`
  }
}

