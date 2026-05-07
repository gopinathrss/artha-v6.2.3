import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLibraryForPlans, ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()

/** Within `assertValidMonthYear` future window (not far-future 2030-*). */
function futureMonth(offset: number) {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + offset)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const MY = futureMonth(2)

describe.skipIf(!run)('api this-month', () => {
  let planId: string
  let executedId: string

  beforeAll(async () => {
    await ensureLiveMode()
    await ensureLibraryForPlans()
    await prisma.allocationPlan.deleteMany({ where: { monthYear: MY } })
  })

  afterAll(async () => {
    try {
      await prisma.allocationPlan.deleteMany({ where: { monthYear: MY } })
      if (executedId) await prisma.allocationPlan.delete({ where: { id: executedId } })
    } catch {
      /* */
    }
    await prisma.$disconnect()
  })

  it('POST /api/this-month/generate-now first time → 201', async () => {
    const res = await request(app).post('/api/this-month/generate-now').send({ monthYear: MY }).expect(201)
    planId = res.body.data.plan.id
    expect(planId).toBeTruthy()
  })

  it('second generate same month → 409 PLAN_ALREADY_EXISTS', async () => {
    const res = await request(app).post('/api/this-month/generate-now').send({ monthYear: MY }).expect(409)
    expect(res.body.error).toBe('PLAN_ALREADY_EXISTS')
  })

  it('PATCH row DONE → 200, SipExecution if isin', async () => {
    if (!planId) return
    const plan = await prisma.allocationPlan.findUnique({ where: { id: planId } })
    const rows = (plan?.allocations as { isin?: string; amountCzk?: number }[]) || []
    const idx = rows.findIndex((r) => r.isin)
    if (idx < 0) {
      // still assert route works with skip
      return
    }
    const res = await request(app)
      .patch(`/api/this-month/plan/${planId}/row/${idx}`)
      .send({ action: 'DONE' })
      .expect(200)
    expect(res.body.data.plan).toBeTruthy()
    const sips = await prisma.sipExecution.findMany({ where: { planId } })
    expect(sips.length).toBeGreaterThan(0)
  })

  it('DELETE PROPOSED plan → 200', async () => {
    if (!planId) return
    await request(app).delete(`/api/this-month/plan/${planId}`).expect(200)
  })

  it('DELETE when EXECUTED → 403', async () => {
    const p = await prisma.allocationPlan.create({
      data: {
        monthYear: '2030-02',
        status: 'EXECUTED',
        totalAvailableCzk: 1,
        fixedExpensesCzk: 0,
        reservedEventsCzk: 0,
        investableCzk: 1,
        emergencyTopupCzk: 0,
        planSource: 'MANUAL',
        allocations: [] as object
      }
    })
    executedId = p.id
    const res = await request(app).delete(`/api/this-month/plan/${p.id}`).expect(403)
    expect(res.body.error).toBeTruthy()
  })

  it('PATCH invalid row index → 400', async () => {
    // plan was deleted; create minimal proposed plan for patch
    const p = await prisma.allocationPlan.create({
      data: {
        monthYear: '2030-03',
        status: 'PROPOSED',
        totalAvailableCzk: 10_000,
        fixedExpensesCzk: 0,
        reservedEventsCzk: 0,
        investableCzk: 10_000,
        emergencyTopupCzk: 0,
        planSource: 'MANUAL',
        allocations: [{ destination: 'X', amountCzk: 1, isin: 'ISIN1', reason: 't', rowKey: 'r1' }] as object
      }
    })
    const res = await request(app)
      .patch(`/api/this-month/plan/${p.id}/row/99`)
      .send({ action: 'DONE' })
      .expect(400)
    expect(res.body.error).toBeTruthy()
    await prisma.allocationPlan.delete({ where: { id: p.id } })
  })
})
