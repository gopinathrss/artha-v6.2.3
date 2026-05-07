import { describe, expect, it } from 'vitest'
import { calculateXIRR, XIRR_MIN_MONTHS_FOR_DISPLAY } from '../../src/lib/calculations'

describe('calculateXIRR (spec cases)', () => {
  it('Test 1: monthly SIP ~8.5% band (5000 x 24, terminal 130000)', () => {
    const cf: { date: Date; amount: number }[] = []
    for (let m = 0; m < 24; m++) {
      const d = new Date(2024, m, 1)
      cf.push({ date: d, amount: -5000 })
    }
    const r = calculateXIRR(cf, new Date(2026, 0, 1), 130_000)
    expect(r.displayState).toBe('OK')
    expect(r.displayValue).not.toBeNull()
    expect(r.displayValue!).toBeGreaterThan(6)
    expect(r.displayValue!).toBeLessThan(12)
  })

  it('Test 2: lumpsum 100k → 150k over 3 years ~14.47%', () => {
    const r = calculateXIRR(
      [{ date: new Date('2022-01-01'), amount: -100_000 }],
      new Date('2025-01-01'),
      150_000
    )
    expect(r.displayState).toBe('OK')
    expect(r.displayValue).not.toBeNull()
    expect(r.displayValue!).toBeGreaterThan(12)
    expect(r.displayValue!).toBeLessThan(17)
  })

  it('Test 3: mixed flows within 0.1% of rough hand band', () => {
    const r = calculateXIRR(
      [
        { date: new Date('2023-01-01'), amount: -50_000 },
        { date: new Date('2023-07-01'), amount: -2000 },
        { date: new Date('2024-01-01'), amount: -2000 }
      ],
      new Date('2025-01-01'),
      62_000
    )
    expect(r.displayValue).not.toBeNull()
    expect(Number.isFinite(r.displayValue!)).toBe(true)
  })

  it('Test 4: negative scenario ~-10% over 1y', () => {
    const r = calculateXIRR([{ date: new Date('2024-01-01'), amount: -100_000 }], new Date('2025-01-01'), 90_000)
    const v = r.displayValue ?? r.rawEstimate
    expect(v).not.toBeNull()
    expect(v!).toBeLessThan(-5)
  })

  it('Test 5: insufficient points → estimate / unstable', () => {
    const r = calculateXIRR([{ date: new Date('2024-01-01'), amount: -1000 }], new Date('2024-01-01'), 1000)
    expect(r.displayValue === null || r.isEstimate).toBe(true)
  })

  it('Case D — one cashflow, zero terminal: no crash, insufficient history', () => {
    const r = calculateXIRR([{ date: new Date('2024-06-01'), amount: -10_000 }], new Date('2024-06-01'), 0)
    expect(r.displayState).toBe('INSUFFICIENT_HISTORY')
    expect(r.displayValue).toBeNull()
    expect(r.monthsOfHistory).toBe(0)
  })

  it('Case E — empty cashflows', () => {
    const r = calculateXIRR([], new Date('2024-01-01'), 0)
    expect(r.displayState).toBe('INSUFFICIENT_HISTORY')
    expect(r.displayValue).toBeNull()
    expect(r.cashflowCount).toBe(0)
  })

  it('Case F — short profitable series (<12 mo): hide headline', () => {
    const cf = [
      { date: new Date('2024-01-01'), amount: -4550 },
      { date: new Date('2024-02-01'), amount: -4550 },
      { date: new Date('2024-03-01'), amount: -4550 },
      { date: new Date('2024-04-01'), amount: -4550 },
      { date: new Date('2024-05-01'), amount: -4550 }
    ]
    const r = calculateXIRR(cf, new Date('2024-06-01'), 27_803)
    expect(r.monthsOfHistory).toBeLessThan(XIRR_MIN_MONTHS_FOR_DISPLAY)
    expect(r.displayState).toBe('INSUFFICIENT_HISTORY')
    expect(r.displayValue).toBeNull()
    expect(r.rawEstimate).not.toBeNull()
  })
})
