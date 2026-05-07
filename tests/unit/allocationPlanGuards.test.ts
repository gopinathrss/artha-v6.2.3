import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertValidMonthYear } from '../../src/lib/allocationPlanGuards'

describe('assertValidMonthYear', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts current UTC month', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    assertValidMonthYear('2026-05', new Date(Date.UTC(2026, 4, 15)))
  })

  it('accepts last month', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    assertValidMonthYear('2026-04', new Date(Date.UTC(2026, 4, 15)))
  })

  it('accepts +3 months boundary', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    assertValidMonthYear('2026-08', new Date(Date.UTC(2026, 4, 15)))
  })

  it('rejects +6 months', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    expect(() => assertValidMonthYear('2026-11', new Date(Date.UTC(2026, 4, 15)))).toThrow(/more than/)
  })

  it('rejects 2030-07 from 2026', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    expect(() => assertValidMonthYear('2030-07', new Date(Date.UTC(2026, 4, 15)))).toThrow(/more than/)
  })

  it('rejects >10y past', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    expect(() => assertValidMonthYear('2010-01', new Date(Date.UTC(2026, 4, 15)))).toThrow(/past/)
  })

  it('rejects malformed', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15)))
    expect(() => assertValidMonthYear('2026-13', new Date(Date.UTC(2026, 4, 15)))).toThrow(/Invalid month/)
    expect(() => assertValidMonthYear('bad', new Date(Date.UTC(2026, 4, 15)))).toThrow(/Invalid monthYear format/)
  })
})
