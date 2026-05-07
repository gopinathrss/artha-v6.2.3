import type { HoldingSnapshot, SignalContext, SignalEvaluation } from '../types'

export type FundStrategyRow = {
  profitCapPct: { toString(): string } | number
  profitCapCzk: { toString(): string } | number
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number((v as any)?.toString?.() ?? v)
  return Number.isFinite(x) ? x : 0
}

export function evaluateProfitCapSignal(
  snapshot: HoldingSnapshot,
  strategy: FundStrategyRow,
  context: SignalContext
): SignalEvaluation {
  const capPct = n(strategy.profitCapPct)
  const capCzk = n(strategy.profitCapCzk)
  const gainPct = n(snapshot.gainPct)
  const cur = n(snapshot.currentValueCzk)

  const pctCapHit = capPct > 0 && gainPct >= capPct
  const czkCapHit = capCzk > 0 && cur >= capCzk
  const approaching =
    (capPct > 0 && gainPct >= capPct * 0.9) || (capCzk > 0 && cur >= capCzk * 0.9)

  const cc: SignalEvaluation['crossChecks'] = []

  if (!pctCapHit && !czkCapHit && !approaching) {
    return {
      signalType: 'PROFIT_CAP',
      fired: false,
      strength: 'HOLD',
      rawValue: gainPct,
      threshold: capPct || null,
      crossChecks: [],
      reasoning: 'Profit cap not near.'
    }
  }

  // Approaching-only signal.
  if (!pctCapHit && !czkCapHit && approaching) {
    return {
      signalType: 'PROFIT_CAP',
      fired: true,
      strength: 'WARNING',
      rawValue: gainPct,
      threshold: capPct || null,
      crossChecks: [],
      reasoning: 'Approaching profit cap — early warning.'
    }
  }

  // Cap hit: may adjust upward on positive momentum (cap only moves up).
  const cagr = context.backtestStats?.cagrPct5yr ?? null
  const nearPeak = snapshot.peakValueCzk > 0 ? cur > snapshot.peakValueCzk * 0.95 : true
  const positiveMomentum = cagr != null && cagr > 10 && gainPct > 0 && nearPeak

  if (positiveMomentum) {
    const newCapPct = capPct > 0 ? capPct * 1.1 : capPct
    const newCapCzk = capCzk > 0 ? capCzk * 1.1 : capCzk
    cc.push({
      name: 'forward_momentum',
      input: `cagr=${cagr.toFixed(1)}, nearPeak=${nearPeak}`,
      result: 'OVERRIDE',
      note: `Positive momentum — recommend adjusting profit caps up 10% to ${newCapPct.toFixed(1)}% / ${Math.round(
        newCapCzk
      ).toLocaleString('cs-CZ')} Kč.`
    })
    return {
      signalType: 'PROFIT_CAP',
      fired: true,
      strength: 'WARNING',
      rawValue: pctCapHit ? gainPct : cur,
      threshold: pctCapHit ? capPct : capCzk,
      crossChecks: cc,
      reasoning: 'Profit cap reached but momentum positive — adjust cap upward (no sell trigger).',
      meta: { adjustCaps: true, newCapPct, newCapCzk, capTrigger: pctCapHit ? 'PCT' : 'CZK' }
    }
  }

  cc.push({
    name: 'forward_momentum',
    input: `cagr=${cagr == null ? 'null' : cagr.toFixed(1)}`,
    result: 'CONFIRM',
    note: 'Momentum flat/unknown — take profit per cap.'
  })

  return {
    signalType: 'PROFIT_CAP',
    fired: true,
    strength: 'SOFT_SELL',
    rawValue: pctCapHit ? gainPct : cur,
    threshold: pctCapHit ? capPct : capCzk,
    crossChecks: cc,
    reasoning: 'Profit cap reached — take profit (soft).',
    meta: { adjustCaps: false, capTrigger: pctCapHit ? 'PCT' : 'CZK' }
  }
}

