import type { HoldingSnapshot, SignalContext, SignalEvaluation } from '../types'

export type FundStrategyRow = {
  allocationPct: { toString(): string } | number
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number((v as any)?.toString?.() ?? v)
  return Number.isFinite(x) ? x : 0
}

export function evaluateTaxSignal(
  snapshot: HoldingSnapshot,
  _strategy: FundStrategyRow,
  context: SignalContext
): SignalEvaluation {
  const cc: SignalEvaluation['crossChecks'] = []

  const days = snapshot.daysUntilTaxFree
  const isTaxFree = !!snapshot.isTaxFree
  const approaching = !isTaxFree && typeof days === 'number' && days <= 90

  if (!isTaxFree && !approaching) {
    return {
      signalType: 'TAX',
      fired: false,
      strength: 'HOLD',
      rawValue: days ?? null,
      threshold: 90,
      crossChecks: [],
      reasoning: 'Tax window not near.'
    }
  }

  let strength: SignalEvaluation['strength'] = isTaxFree ? 'STRONG_SELL' : 'WARNING'
  let reasoning = isTaxFree
    ? 'Tax-free window reached — eligible for tax-free exit.'
    : `Tax-free window approaching (${days}d).`

  // Cross-check: forward momentum
  const cagr = context.backtestStats?.cagrPct5yr ?? null
  if (isTaxFree) {
    if (cagr != null && cagr > 8) {
      cc.push({
        name: 'forward_momentum',
        input: `cagrPct5yr=${cagr}`,
        result: 'OVERRIDE',
        note: `5yr CAGR ${cagr.toFixed(1)}% — fund still growing, defer tax-free exit.`
      })
      strength = 'REVIEW'
    } else if (cagr != null && cagr <= 0) {
      cc.push({
        name: 'forward_momentum',
        input: `cagrPct5yr=${cagr}`,
        result: 'CONFIRM',
        note: 'Negative CAGR — tax-free exit now is optimal.'
      })
      strength = 'STRONG_SELL'
    } else {
      cc.push({
        name: 'forward_momentum',
        input: 'cagrPct5yr=null',
        result: 'NEUTRAL',
        note: 'No backtest data — cannot assess forward momentum.'
      })
      // Conservative default: take tax-free exit.
      strength = 'STRONG_SELL'
    }
  }

  // Cross-check: allocation after sell (rough — use sleeve pct hints when present)
  if (isTaxFree && context.targetSleevePct != null && context.currentSleevePct != null) {
    const cur = n(context.currentSleevePct)
    const tgt = n(context.targetSleevePct)
    const gap = Math.max(0, tgt - cur)
    if (gap > 20) {
      cc.push({
        name: 'allocation_after_sell',
        input: `gap=${gap.toFixed(1)}pp`,
        result: 'OVERRIDE',
        note: `Selling would create ~${gap.toFixed(1)}pp sleeve gap — consider partial sell.`
      })
      if (strength === 'STRONG_SELL') strength = 'SOFT_SELL'
    }
  }

  if (strength === 'REVIEW' && isTaxFree) {
    reasoning += ' Cross-check suggests deferring despite tax-free eligibility.'
  }

  return {
    signalType: 'TAX',
    fired: true,
    strength,
    rawValue: isTaxFree ? 0 : days ?? null,
    threshold: 90,
    crossChecks: cc,
    reasoning
  }
}

