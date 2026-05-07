import type { HoldingSnapshot, SignalContext, SignalEvaluation } from '../types'

export type FundStrategyRow = {
  allocationPct: { toString(): string } | number
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number((v as any)?.toString?.() ?? v)
  return Number.isFinite(x) ? x : 0
}

export function evaluateAllocationSignal(
  snapshot: HoldingSnapshot,
  strategy: FundStrategyRow,
  context: SignalContext
): SignalEvaluation {
  const targetPct = n(strategy.allocationPct)
  const currentPct = n(snapshot.currentAllocationPct)
  const drift = currentPct - targetPct

  const cc: SignalEvaluation['crossChecks'] = []

  if (!(drift > 15)) {
    return {
      signalType: 'ALLOCATION',
      fired: false,
      strength: 'HOLD',
      rawValue: drift,
      threshold: 15,
      crossChecks: [],
      reasoning: `Allocation ${currentPct.toFixed(1)}% vs target ${targetPct.toFixed(1)}% (${drift.toFixed(1)}pp drift).`
    }
  }

  // Allocation signals cap at SOFT_SELL.
  let strength: SignalEvaluation['strength'] = 'SOFT_SELL'
  let reasoning = `Allocation ${currentPct.toFixed(1)}% vs target ${targetPct.toFixed(1)}% (${drift.toFixed(1)}pp drift).`

  const peerAvg = context.peerAverageCagrPct
  const cagr = context.backtestStats?.cagrPct5yr ?? null

  // Cross-check: outperformance
  if (cagr != null && peerAvg != null && cagr > peerAvg + 3) {
    cc.push({
      name: 'peer_outperformance',
      input: `cagr=${cagr.toFixed(1)} vs peerAvg=${peerAvg.toFixed(1)}`,
      result: 'OVERRIDE',
      note: `Fund outperforming peers by ${(cagr - peerAvg).toFixed(1)}pp CAGR — partial sell only.`
    })
    strength = 'REVIEW'
  }

  // Cross-check: tax proximity
  if (snapshot.daysUntilTaxFree != null && snapshot.daysUntilTaxFree <= 180 && !snapshot.isTaxFree) {
    cc.push({
      name: 'tax_proximity',
      input: `${snapshot.daysUntilTaxFree} days to tax-free`,
      result: 'OVERRIDE',
      note: 'Close to tax-free — defer rebalance sell to avoid unnecessary tax.'
    })
    strength = 'REVIEW'
  }

  return {
    signalType: 'ALLOCATION',
    fired: true,
    strength,
    rawValue: drift,
    threshold: 15,
    crossChecks: cc,
    reasoning
  }
}

