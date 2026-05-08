import { describe, expect, it } from 'vitest'
import {
  computeAnnualInterest,
  computeSleepingAmount,
  effectiveRatePct,
  marginalRatePct,
  optimalCapCzk,
  parseInterestTiersJson,
  validateInterestTiers
} from '../../../src/lib/intelligence/interestTiers'

describe('interestTiers', () => {
  const twoTier = [
    { upTo: 400_000, ratePct: 3 },
    { above: 400_000, ratePct: 0.01 }
  ]

  it('A: two-tier annual interest and derived rates', () => {
    expect(computeAnnualInterest(600_000, twoTier)).toBeCloseTo(12_020, 1)
    expect(effectiveRatePct(600_000, twoTier)).toBeCloseTo(2.0033, 2)
    expect(marginalRatePct(600_000, twoTier)).toBe(0.01)
    expect(optimalCapCzk(twoTier)).toBe(400_000)
  })

  it('B: sleeping amount with emergency + optimal cap', () => {
    const r = computeSleepingAmount(718_590, twoTier, 2.5, 200_000)
    expect(r.sleepingCzk).toBeCloseTo(318_590, 0)
    expect(r.sleepingRatePct).toBe(0.01)
    expect(r.annualRealLossCzk).toBeCloseTo(7933, 0)
  })

  it('C: no tiers → zero nominal interest; sleeping uses balance minus emergency', () => {
    expect(computeAnnualInterest(500_000, [])).toBe(0)
    const r = computeSleepingAmount(500_000, [], 2.5, 100_000)
    expect(r.sleepingCzk).toBe(400_000)
    expect(r.annualRealLossCzk).toBeCloseTo(10_000, 0)
  })

  it('D: single flat rate above inflation → no sleeping', () => {
    const r = computeSleepingAmount(200_000, [{ upTo: 500_000, ratePct: 4 }], 2.5, 0)
    expect(r.sleepingCzk).toBe(0)
    expect(r.annualRealLossCzk).toBe(0)
  })

  it('E: marginal rate at exact upTo boundary', () => {
    expect(marginalRatePct(400_000, twoTier)).toBe(3)
  })

  it('V1: validateInterestTiers accepts a valid two-tier array', () => {
    const r = validateInterestTiers(twoTier)
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.tiers.length).toBe(2)
  })

  it('V2: validateInterestTiers rejects ratePct="abc"', () => {
    const r = validateInterestTiers([{ upTo: 10, ratePct: 'abc' }])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors[0]?.message).toMatch(/ratePct/i)
  })

  it('V3: validateInterestTiers rejects both upTo and above present', () => {
    const r = validateInterestTiers([{ upTo: 10, above: 0, ratePct: 1 }])
    expect(r.valid).toBe(false)
  })

  it('V4: validateInterestTiers rejects neither upTo nor above', () => {
    const r = validateInterestTiers([{ ratePct: 1 }])
    expect(r.valid).toBe(false)
  })

  it('V5: validateInterestTiers rejects ratePct out of range', () => {
    const r = validateInterestTiers([{ upTo: 10, ratePct: 150 }])
    expect(r.valid).toBe(false)
  })

  it('V6: validateInterestTiers accepts empty array as valid', () => {
    const r = validateInterestTiers([])
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.tiers).toEqual([])
  })

  it('V7: parseInterestTiersJson returns [] for null', () => {
    expect(parseInterestTiersJson(null)).toEqual([])
  })

  it('V8: parseInterestTiersJson returns [] for invalid arrays', () => {
    expect(parseInterestTiersJson([{ upTo: 10, ratePct: 'abc' }])).toEqual([])
  })
})
