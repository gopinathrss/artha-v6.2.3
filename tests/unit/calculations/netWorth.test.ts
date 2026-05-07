import { describe, expect, it } from 'vitest'
import { calculateNetWorth } from '../../../src/lib/calculations'

describe('calculateNetWorth inflow-weighted fields (F2.5)', () => {
  it('exposes inflowWeightedGainCzk / inflowWeightedGainPct (not gainCzk / gainPct)', () => {
    const r = calculateNetWorth(
      [{ status: 'ACTIVE', currentValueCzk: 200 }],
      [],
      100,
      { EURCZK: 25, EURINR: 90 }
    )
    expect(r).not.toHaveProperty('gainCzk')
    expect(r).not.toHaveProperty('gainPct')
    expect(r.inflowWeightedGainCzk).toBeCloseTo(100, 4)
    expect(r.inflowWeightedGainPct).toBeCloseTo(100, 4)
  })
})
