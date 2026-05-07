import { describe, expect, it } from 'vitest'
import { combineSellSignals } from '../../../src/lib/intelligence/sellDecisionEngine'
import type { HoldingSnapshot, SignalEvaluation } from '../../../src/lib/intelligence/types'

function snap(): HoldingSnapshot {
  return {
    holdingId: 'h1',
    isin: 'X',
    name: 'Fund',
    currentValueCzk: 100000,
    costBasisCzk: 90000,
    peakValueCzk: 120000,
    gainPct: 11.1,
    drawdownFromPeak: 16.7,
    currentAllocationPct: 10,
    taxFreeDate: null,
    daysUntilTaxFree: null,
    isTaxFree: false,
    category: 'EQUITY'
  }
}

function sig(partial: Partial<SignalEvaluation>): SignalEvaluation {
  return {
    signalType: 'TAX',
    fired: false,
    strength: 'HOLD',
    rawValue: null,
    threshold: null,
    crossChecks: [],
    reasoning: 'x',
    ...partial
  }
}

describe('combineSellSignals', () => {
  it('All HOLD -> overall HOLD', () => {
    const out = combineSellSignals({
      holdingId: 'h1',
      strategyId: 's1',
      snapshot: snap(),
      signals: [sig({ signalType: 'TAX' }), sig({ signalType: 'ALLOCATION' }), sig({ signalType: 'PROFIT_CAP' }), sig({ signalType: 'DRAWDOWN' })]
    })
    expect(out.overallStrength).toBe('HOLD')
    expect(out.recommendedAction).toBe('HOLD')
    expect(out.shouldNotify).toBe(false)
  })

  it('One SOFT_SELL -> PLAN_SELL', () => {
    const out = combineSellSignals({
      holdingId: 'h1',
      strategyId: 's1',
      snapshot: snap(),
      signals: [sig({ signalType: 'PROFIT_CAP', fired: true, strength: 'SOFT_SELL' })]
    })
    expect(out.overallStrength).toBe('SOFT_SELL')
    expect(out.recommendedAction).toBe('PLAN_SELL')
    expect(out.urgencyDays).toBe(30)
    expect(out.shouldNotify).toBe(true)
  })

  it('DRAWDOWN STRONG_SELL overrides others', () => {
    const out = combineSellSignals({
      holdingId: 'h1',
      strategyId: 's1',
      snapshot: snap(),
      signals: [
        sig({ signalType: 'DRAWDOWN', fired: true, strength: 'STRONG_SELL' }),
        sig({ signalType: 'ALLOCATION', fired: true, strength: 'SOFT_SELL' })
      ]
    })
    expect(out.overallStrength).toBe('STRONG_SELL')
    expect(out.primarySignal).toBe('DRAWDOWN')
    expect(out.recommendedAction).toBe('SELL_NOW')
  })

  it('TAX REVIEW + PROFIT_CAP SOFT_SELL -> SOFT_SELL (profit cap primary)', () => {
    const out = combineSellSignals({
      holdingId: 'h1',
      strategyId: 's1',
      snapshot: snap(),
      signals: [
        sig({ signalType: 'TAX', fired: true, strength: 'REVIEW' }),
        sig({ signalType: 'PROFIT_CAP', fired: true, strength: 'SOFT_SELL' })
      ]
    })
    expect(out.overallStrength).toBe('SOFT_SELL')
    expect(out.primarySignal).toBe('PROFIT_CAP')
  })

  it('WARNING does not notify', () => {
    const out = combineSellSignals({
      holdingId: 'h1',
      strategyId: 's1',
      snapshot: snap(),
      signals: [sig({ signalType: 'TAX', fired: true, strength: 'WARNING' })]
    })
    expect(out.overallStrength).toBe('WARNING')
    expect(out.recommendedAction).toBe('WATCH')
    expect(out.shouldNotify).toBe(false)
  })
})

