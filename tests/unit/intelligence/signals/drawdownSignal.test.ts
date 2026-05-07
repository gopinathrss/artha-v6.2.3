import { describe, expect, it } from 'vitest'
import { evaluateDrawdownSignal } from '../../../../src/lib/intelligence/signals/drawdownSignal'
import type { HoldingSnapshot, SignalContext } from '../../../../src/lib/intelligence/types'

function snap(drawdownFromPeak: number, daysUntilTaxFree: number | null = null): HoldingSnapshot {
  return {
    holdingId: 'h1',
    isin: 'X',
    name: 'Fund',
    currentValueCzk: 100000,
    costBasisCzk: 90000,
    peakValueCzk: 120000,
    gainPct: 11.1,
    drawdownFromPeak,
    currentAllocationPct: 10,
    taxFreeDate: null,
    daysUntilTaxFree,
    isTaxFree: daysUntilTaxFree != null ? daysUntilTaxFree <= 0 : false,
    category: 'EQUITY'
  }
}

function ctx(overrides: Partial<SignalContext> = {}): SignalContext {
  return {
    totalPortfolioCzk: 800000,
    allHoldingsByCategory: {},
    riskProfile: 'MODERATE',
    backtestStats: { cagrPct5yr: 8, maxDrawdownPct: 30, sharpeRatio: 1.2, recoveryMonths: 24 },
    peerAverageCagrPct: 8,
    ...overrides
  }
}

describe('drawdownSignal', () => {
  it('Normal zone (5% vs guardrail 20%) does not fire', () => {
    const out = evaluateDrawdownSignal(snap(5), { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 }, ctx())
    expect(out.fired).toBe(false)
    expect(out.strength).toBe('HOLD')
  })

  it('Warning zone (12% vs guardrail 20%) fires WARNING', () => {
    const out = evaluateDrawdownSignal(snap(12), { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 }, ctx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('WARNING')
  })

  it('Guardrail hit but within historical max downgrades to REVIEW', () => {
    const out = evaluateDrawdownSignal(snap(22), { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 }, ctx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('REVIEW')
  })

  it('Exceeds historical max -> STRONG_SELL', () => {
    const out = evaluateDrawdownSignal(snap(35), { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 }, ctx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('STRONG_SELL')
  })

  it('RISK_SELL but tax-free in 60d -> SOFT_SELL', () => {
    const out = evaluateDrawdownSignal(snap(35, 60), { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 }, ctx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('SOFT_SELL')
  })

  it('RISK_SELL but fast recovery -> SOFT_SELL', () => {
    const out = evaluateDrawdownSignal(
      snap(35),
      { drawdownGuardrailPct: 20, drawdownHistoricalMax: 30 },
      ctx({ backtestStats: { cagrPct5yr: 8, maxDrawdownPct: 30, sharpeRatio: 1.2, recoveryMonths: 6 } })
    )
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('SOFT_SELL')
  })

  it('No historical max -> conservative STRONG_SELL on guardrail breach', () => {
    const out = evaluateDrawdownSignal(snap(22), { drawdownGuardrailPct: 20, drawdownHistoricalMax: null }, ctx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('STRONG_SELL')
  })
})

