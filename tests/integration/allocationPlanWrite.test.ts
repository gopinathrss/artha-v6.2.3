import './testEnv'
import { afterAll, describe, expect, it } from 'vitest'
import { hasTestDatabase } from '../api/helpers'
import { prisma } from '../../src/lib/prisma'
import { parsePlanAllocations, parseAllocationsJsonStrict } from '../../src/lib/allocationPlanSchema'
import { replacePlanRows, type PlanRowClient } from '../../src/lib/allocationPlanRows'
import { assertValidMonthYear } from '../../src/lib/allocationPlanGuards'
import { num } from '../../src/lib/money'

const run = hasTestDatabase()

function nextMonthYear() {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

describe.skipIf(!run)('integration: AllocationPlan dual-write (F1.1)', () => {
  const my = nextMonthYear()
  let planId: string

  const seedRows = [
    { type: 'BUY' as const, amountCzk: '100', reason: 'b1', isin: 'IE1', destination: 'D1' },
    { type: 'BUY' as const, amountCzk: '200', reason: 'b2', isin: 'IE2', destination: 'D2' },
    { type: 'BUY' as const, amountCzk: '300', reason: 'b3', isin: 'IE3', destination: 'D3' },
    {
      type: 'SELL' as const,
      amountCzk: '50',
      reason: 's1',
      isin: 'IE4',
      source: 'acc',
      sellSubtype: 'REBALANCE',
      currentValueCzk: '1000',
      taxImpactCzk: null
    },
    {
      type: 'HOLD' as const,
      amountCzk: 0,
      reason: 'h1',
      isin: 'IE5',
      currentValueCzk: '99',
      holdReason: 'AT_TARGET'
    }
  ]

  afterAll(async () => {
    if (planId) {
      await prisma.allocationPlan.deleteMany({ where: { id: planId } }).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  })

  it('creates JSON + AllocationPlanRow in one transaction with matching order and amounts', async () => {
    await prisma.allocationPlan.deleteMany({ where: { monthYear: my } })

    const validated = parseAllocationsJsonStrict(seedRows)

    planId = await prisma.$transaction(async (tx) => {
      assertValidMonthYear(my)
      const plan = await tx.allocationPlan.create({
        data: {
          monthYear: my,
          status: 'PROPOSED',
          totalAvailableCzk: 10_000,
          fixedExpensesCzk: 0,
          reservedEventsCzk: 0,
          investableCzk: 10_000,
          emergencyTopupCzk: 0,
          planSource: 'MANUAL',
          allocations: validated as object
        }
      })
      await replacePlanRows(tx as unknown as PlanRowClient, plan.id, validated)
      return plan.id
    })

    const plan = await prisma.allocationPlan.findUnique({
      where: { id: planId },
      include: { rows: { orderBy: { orderIndex: 'asc' } } }
    })
    expect(plan).toBeTruthy()
    const jsonArr = plan!.allocations as unknown[]
    expect(jsonArr).toHaveLength(5)
    expect(plan!.rows).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(plan!.rows[i]!.orderIndex).toBe(i)
      expect(plan!.rows[i]!.type).toBe(seedRows[i]!.type)
      expect(num(plan!.rows[i]!.amountCzk as never)).toBe(
        num((seedRows[i] as { amountCzk: number | string }).amountCzk)
      )
    }
  })

  it('updates executionStatus on JSON and rows together', async () => {
    if (!planId) return
    await prisma.$transaction(async (tx) => {
      const plan = await tx.allocationPlan.findUnique({ where: { id: planId } })
      if (!plan) throw new Error('missing plan')
      const all = parsePlanAllocations(plan.allocations)
      const first = all[0]!
      all[0] = {
        ...first,
        executionStatus: 'DONE',
        executedAt: new Date().toISOString()
      } as (typeof all)[0]
      await tx.allocationPlan.update({
        where: { id: planId },
        data: { allocations: all as object }
      })
      await replacePlanRows(tx as unknown as PlanRowClient, planId, all)
    })

    const again = await prisma.allocationPlan.findUnique({
      where: { id: planId },
      include: { rows: { orderBy: { orderIndex: 'asc' } } }
    })
    const json0 = (again!.allocations as Record<string, unknown>[])[0]!
    expect(json0.executionStatus).toBe('DONE')
    expect(again!.rows[0]!.executionStatus).toBe('DONE')
  })
})
