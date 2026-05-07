import { describe, expect, it } from 'vitest'
import { loadApprovedStrategies } from '../../../src/lib/intelligence/strategyContext'

describe('strategyContext.loadApprovedStrategies', () => {
  it('builds a map and detects cap reached', async () => {
    const now = new Date()
    const prisma = {
      fundStrategy: {
        findMany: async () => [
          {
            id: 's1',
            holdingId: 'h1',
            monthlySipCzk: { toString: () => '15000' },
            absoluteCapCzk: { toString: () => '300000' },
            monthsToTarget: 12,
            profitCapPct: { toString: () => '35' },
            profitCapCzk: { toString: () => '405000' },
            allocationSleve: 'equity',
            confidence: 'HIGH',
            approvedAt: new Date(now.getTime() - 2 * 30.4 * 86400000),
            createdAt: new Date(now.getTime() - 3 * 30.4 * 86400000),
            reviewDate: new Date(now.getTime() + 12 * 30.4 * 86400000),
            holding: { id: 'h1', currentValueCzk: { toString: () => '50000' } }
          },
          {
            id: 's2',
            holdingId: 'h2',
            monthlySipCzk: { toString: () => '5000' },
            absoluteCapCzk: { toString: () => '300000' },
            monthsToTarget: 12,
            profitCapPct: { toString: () => '35' },
            profitCapCzk: { toString: () => '405000' },
            allocationSleve: 'equity',
            confidence: 'HIGH',
            approvedAt: new Date(now.getTime() - 1 * 86400000),
            createdAt: new Date(now.getTime() - 2 * 86400000),
            reviewDate: new Date(now.getTime() + 12 * 30.4 * 86400000),
            holding: { id: 'h2', currentValueCzk: { toString: () => '305000' } }
          }
        ]
      }
    } as any

    const map = await loadApprovedStrategies(prisma)
    expect(map.size).toBe(2)
    const a = map.get('h1')!
    expect(a.isCapReached).toBe(false)
    expect(a.monthlySipCzk).toBe(15000)
    expect(a.currentMonth).toBe(3)

    const b = map.get('h2')!
    expect(b.isCapReached).toBe(true)
    expect(b.currentMonth).toBe(1)
  })
})

