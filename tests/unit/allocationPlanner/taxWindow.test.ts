/**
 * F3.3 planner outcomes: see `tests/unit/allocationPlanner.test.ts` (8, 8a, 8b, 8c).
 * This file locks the tax-status math used by `nearTax` in `allocationPlanner.ts`.
 */
import { describe, expect, it } from 'vitest'
import { calculateTaxStatus } from '../../../src/lib/calculations'

function mkHolding(taxFreeOffsetDays: number) {
  const taxFree = new Date()
  taxFree.setUTCDate(taxFree.getUTCDate() + taxFreeOffsetDays)
  const purchase = new Date(taxFree)
  purchase.setUTCFullYear(purchase.getUTCFullYear() - 3)
  return {
    taxFreeDate: taxFree,
    purchaseStartDate: purchase,
    category: 'EQUITY',
    status: 'ACTIVE'
  }
}

describe('tax window vs calculateTaxStatus (F3.3)', () => {
  const today = new Date()

  it('80d to tax-free: not isTaxFree, nearTax true (<90)', () => {
    const t = calculateTaxStatus(mkHolding(80), today)
    expect(t.isTaxFree).toBe(false)
    expect(t.daysUntilTaxFree).toBeGreaterThan(0)
    expect(t.daysUntilTaxFree).toBeLessThan(90)
  })

  it('200d to tax-free: not isTaxFree, nearTax false', () => {
    const t = calculateTaxStatus(mkHolding(200), today)
    expect(t.isTaxFree).toBe(false)
    expect(t.daysUntilTaxFree).toBeGreaterThanOrEqual(90)
  })

  it('past tax-free date: isTaxFree', () => {
    const t = calculateTaxStatus(mkHolding(-5), today)
    expect(t.isTaxFree).toBe(true)
    expect(t.daysUntilTaxFree).toBeLessThanOrEqual(0)
  })
})
