import { describe, expect, it } from 'vitest'
import { evaluateProfitCapSignal } from '../../../../src/lib/intelligence/signals/profitCapSignal'
import type { HoldingSnapshot, SignalContext } from '../../../../src/lib/intelligence/types'

function snap(gainPct: number, currentValueCzk: number, peakValueCzk: number): HoldingSnapshot {
  return {
    holdingId: 'h1',
    isin: 'X',
    name: 'Fund',
    currentValueCzk,
    costBasisCzk: 100000,
    peakValueCzk,
    gainPct,
    drawdownFromPeak: peakValueCzk > 0 ? ((peakValueCzk - currentValueCzk) / peakValueCzk) * 100 : 0,
    currentAllocationPct: 10,
    taxFreeDate: null,
    daysUntilTaxFree: null,
    isTaxFree: false,
    category: 'EQUITY'
  }
}

function ctx(cagrPct5yr: number | null): SignalContext {
  return {
    totalPortfolioCzk: 800000,
    allHoldingsByCategory: {},
    riskProfile: 'MODERATE',
    backtestStats: cagrPct5yr == null ? null : { cagrPct5yr, maxDrawdownPct: 30, sharpeRatio: 1.2, recoveryMonths: 18 },
    peerAverageCagrPct: 8
  }
}

describe('profitCapSignal', () => {
  it('PCT cap hit + positive momentum recommends adjustment (WARNING)', () => {
    const out = evaluateProfitCapSignal(
      snap(38, 138000, 140000),
      { profitCapPct: 35, profitCapCzk: 400000 },
      ctx(12)
    )
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('WARNING')
    expect(out.crossChecks.some((c) => c.result === 'OVERRIDE')).toBe(true)
    expect(out.meta?.adjustCaps).toBe(true)
  })

  it('PCT cap hit + flat momentum -> SOFT_SELL', () => {
    const out = evaluateProfitCapSignal(
      snap(38, 138000, 200000),
      { profitCapPct: 35, profitCapCzk: 400000 },
      ctx(1)
    )
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('SOFT_SELL')
  })

  it('CZK cap hit -> SOFT_SELL or WARNING depending on momentum', () => {
    const out = evaluateProfitCapSignal(
      snap(10, 410000, 420000),
      { profitCapPct: 35, profitCapCzk: 400000 },
      ctx(1)
    )
    expect(out.fired).toBe(true)
    expect(['SOFT_SELL', 'WARNING']).toContain(out.strength)
  })

  it('Approaching threshold -> WARNING', () => {
    const out = evaluateProfitCapSignal(
      snap(32, 360000, 370000),
      { profitCapPct: 35, profitCapCzk: 400000 },
      ctx(8)
    )
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('WARNING')
  })

  it('Well below cap -> not fired', () => {
    const out = evaluateProfitCapSignal(
      snap(15, 150000, 200000),
      { profitCapPct: 35, profitCapCzk: 400000 },
      ctx(8)
    )
    expect(out.fired).toBe(false)
  })
})

