import { describe, expect, it } from 'vitest'
import { evaluateTaxSignal } from '../../../../src/lib/intelligence/signals/taxSignal'
import type { HoldingSnapshot, SignalContext } from '../../../../src/lib/intelligence/types'

function baseSnapshot(): HoldingSnapshot {
  return {
    holdingId: 'h1',
    isin: 'X',
    name: 'Fund',
    currentValueCzk: 100000,
    costBasisCzk: 80000,
    peakValueCzk: 105000,
    gainPct: 25,
    drawdownFromPeak: 5,
    currentAllocationPct: 12,
    taxFreeDate: null,
    daysUntilTaxFree: null,
    isTaxFree: false,
    category: 'EQUITY'
  }
}

function baseCtx(): SignalContext {
  return {
    totalPortfolioCzk: 800000,
    allHoldingsByCategory: {},
    riskProfile: 'MODERATE',
    backtestStats: { cagrPct5yr: 11.9, maxDrawdownPct: 23.5, sharpeRatio: 1.5, recoveryMonths: 8 },
    peerAverageCagrPct: 8
  }
}

describe('taxSignal', () => {
  it('Tax-free, positive CAGR downgrades to REVIEW', () => {
    const snap = { ...baseSnapshot(), isTaxFree: true, daysUntilTaxFree: 0 }
    const ctx = baseCtx()
    ctx.backtestStats = { ...ctx.backtestStats!, cagrPct5yr: 12 }
    const out = evaluateTaxSignal(snap, { allocationPct: 40 }, ctx)
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('REVIEW')
    expect(out.crossChecks.some((c) => c.result === 'OVERRIDE')).toBe(true)
  })

  it('Tax-free, negative CAGR stays STRONG_SELL', () => {
    const snap = { ...baseSnapshot(), isTaxFree: true, daysUntilTaxFree: 0 }
    const ctx = baseCtx()
    ctx.backtestStats = { ...ctx.backtestStats!, cagrPct5yr: -1 }
    const out = evaluateTaxSignal(snap, { allocationPct: 40 }, ctx)
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('STRONG_SELL')
    expect(out.crossChecks.some((c) => c.result === 'CONFIRM')).toBe(true)
  })

  it('Tax-free, no backtest is conservative STRONG_SELL', () => {
    const snap = { ...baseSnapshot(), isTaxFree: true, daysUntilTaxFree: 0 }
    const ctx = baseCtx()
    ctx.backtestStats = null
    const out = evaluateTaxSignal(snap, { allocationPct: 40 }, ctx)
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('STRONG_SELL')
  })

  it('Approaching (60 days) fires WARNING', () => {
    const snap = { ...baseSnapshot(), isTaxFree: false, daysUntilTaxFree: 60 }
    const out = evaluateTaxSignal(snap, { allocationPct: 40 }, baseCtx())
    expect(out.fired).toBe(true)
    expect(out.strength).toBe('WARNING')
  })

  it('Far from tax-free does not fire', () => {
    const snap = { ...baseSnapshot(), isTaxFree: false, daysUntilTaxFree: 500 }
    const out = evaluateTaxSignal(snap, { allocationPct: 40 }, baseCtx())
    expect(out.fired).toBe(false)
  })
})

