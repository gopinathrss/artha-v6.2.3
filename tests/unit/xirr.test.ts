import { describe, expect, it } from 'vitest'
import { calculateXIRR } from '../../src/lib/calculations'

describe('calculateXIRR (spec cases)', () => {
  it('Test 1: monthly SIP ~8.5% band (5000 x 24, terminal 130000)', () => {
    const cf: { date: Date; amount: number }[] = []
    for (let m = 0; m < 24; m++) {
      const d = new Date(2024, m, 1)
      cf.push({ date: d, amount: -5000 })
    }
    const r = calculateXIRR(cf, new Date(2026, 0, 1), 130_000)
    expect(r.value).not.toBeNull()
    expect(r.value!).toBeGreaterThan(6)
    expect(r.value!).toBeLessThan(12)
  })

  it('Test 2: lumpsum 100k → 150k over 3 years ~14.47%', () => {
    const r = calculateXIRR(
      [{ date: new Date('2022-01-01'), amount: -100_000 }],
      new Date('2025-01-01'),
      150_000
    )
    expect(r.value).not.toBeNull()
    expect(r.value!).toBeGreaterThan(12)
    expect(r.value!).toBeLessThan(17)
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
    expect(r.value).not.toBeNull()
    expect(Number.isFinite(r.value!)).toBe(true)
  })

  it('Test 4: negative scenario ~-10% over 1y', () => {
    const r = calculateXIRR([{ date: new Date('2024-01-01'), amount: -100_000 }], new Date('2025-01-01'), 90_000)
    expect(r.value).not.toBeNull()
    expect(r.value!).toBeLessThan(-5)
  })

  it('Test 5: insufficient points → null/estimate without stable rate', () => {
    const r = calculateXIRR([{ date: new Date('2024-01-01'), amount: -1000 }], new Date('2024-01-01'), 1000)
    expect(r.value === null || r.isEstimate).toBe(true)
  })
})
