import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectRebalanceSells, driftThresholdPpForRiskProfile } from '../../src/lib/sellEngine/rebalanceDrift'

const prismaMock = vi.hoisted(() => ({
  holding: { findMany: vi.fn() }
}))

vi.mock('../../src/lib/prisma', () => ({
  getPrisma: vi.fn(async () => prismaMock)
}))

function czHolding(
  over: Partial<{
    id: string
    isin: string
    name: string
    category: string
    currentValueCzk: number
  }>
) {
  const purchase = new Date()
  purchase.setDate(purchase.getDate() - 400)
  const taxFree = new Date(purchase)
  taxFree.setFullYear(taxFree.getFullYear() + 3)
  return {
    id: over.id ?? 'x',
    isin: over.isin ?? 'ISIN',
    name: over.name ?? 'Name',
    category: over.category ?? 'EQUITY',
    currentValueCzk: over.currentValueCzk ?? 0,
    status: 'ACTIVE',
    country: 'CZ',
    purchaseStartDate: purchase,
    taxFreeDate: taxFree,
    cashflows: [] as { amountCzk: number; type: string }[]
  }
}

beforeEach(() => {
  prismaMock.holding.findMany.mockReset()
})

describe('detectRebalanceSells — min sell threshold', () => {
  it('skips REBALANCE_DRIFT sell when rounded amount is below threshold (266 < 1000)', async () => {
    const holdings = [
      czHolding({ id: 'e', isin: 'EQ1', name: 'Eq', category: 'EQUITY', currentValueCzk: 4234 }),
      czHolding({ id: 'b', isin: 'BD1', name: 'Bond', category: 'BONDS', currentValueCzk: 4266 }),
      czHolding({ id: 'c', isin: 'CA1', name: 'Cash', category: 'CASH', currentValueCzk: 1500 })
    ]
    prismaMock.holding.findMany.mockResolvedValue(holdings as never)
    const drift = driftThresholdPpForRiskProfile('MODERATE')
    const rows = await detectRebalanceSells(
      holdings as never,
      65,
      25,
      10,
      null,
      new Set(),
      null,
      drift,
      1000
    )
    expect(rows.filter((r) => r.type === 'SELL' && r.sellSubtype === 'REBALANCE_DRIFT')).toHaveLength(0)
  })

  it('keeps REBALANCE_DRIFT sell when amount meets threshold (≥ 1000)', async () => {
    const holdings = [
      czHolding({ id: 'e', isin: 'EQ1', name: 'Eq', category: 'EQUITY', currentValueCzk: 2500 }),
      czHolding({ id: 'b', isin: 'BD1', name: 'Bond', category: 'BONDS', currentValueCzk: 6000 }),
      czHolding({ id: 'c', isin: 'CA1', name: 'Cash', category: 'CASH', currentValueCzk: 1500 })
    ]
    prismaMock.holding.findMany.mockResolvedValue(holdings as never)
    const drift = driftThresholdPpForRiskProfile('MODERATE')
    const rows = await detectRebalanceSells(
      holdings as never,
      65,
      25,
      10,
      null,
      new Set(),
      null,
      drift,
      1000
    )
    const sells = rows.filter((r) => r.type === 'SELL' && r.sellSubtype === 'REBALANCE_DRIFT')
    expect(sells.length).toBeGreaterThanOrEqual(1)
    expect(sells.some((r) => r.amountCzk >= 1000)).toBe(true)
  })
})
