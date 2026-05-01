import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLibraryForPlans, ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()
const MONTH = '2036-04'
const HOLDING_ID = 'sell-rows-api-test-hfx'
const ISIN = 'CZ0008472263'

describe.skipIf(!run)('api this-month SELL row + PATCH + SipExecution.side', () => {
  let planId = ''

  beforeAll(async () => {
    await ensureLiveMode()
    await ensureLibraryForPlans()

    const purchaseStartDate = new Date()
    purchaseStartDate.setDate(purchaseStartDate.getDate() - 1100)
    const taxFreeDate = new Date()
    taxFreeDate.setDate(taxFreeDate.getDate() - 5)

    await prisma.allocationPlan.deleteMany({ where: { monthYear: MONTH } })
    await prisma.holding.deleteMany({ where: { id: HOLDING_ID } })

    await prisma.holding.create({
      data: {
        id: HOLDING_ID,
        isin: ISIN,
        name: 'API TEST TaxFree Bond',
        type: 'MUTUAL_FUND',
        category: 'BONDS',
        units: 1000,
        nav: 2.5,
        currency: 'CZK',
        currentValueCzk: 2500,
        monthlySipCzk: 0,
        status: 'ACTIVE',
        purchaseStartDate,
        taxFreeDate,
        country: 'CZ',
        cashflows: {
          create: [{ date: purchaseStartDate, amountCzk: -2000, type: 'LUMP_SUM' }]
        }
      }
    })

    await prisma.userProfile.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        fullName: 'API Sell Test',
        dateOfBirth: new Date('1990-01-01'),
        homeCurrency: 'CZK',
        taxResidency: 'CZ',
        riskProfile: 'MODERATE',
        monthlyNetIncomeCzk: 80_000,
        salaryDayOfMonth: 15,
        emergencyFundTarget: 300_000,
        retirementAge: 60,
        retirementMonthlyExpense: 40_000
      },
      update: {
        monthlyNetIncomeCzk: 80_000,
        riskProfile: 'MODERATE'
      }
    })

    let s = await prisma.settings.findFirst()
    if (!s) {
      await prisma.settings.create({
        data: {
          targetEquityPct: 65,
          targetBondsPct: 25,
          targetCashPct: 10,
          demoModeEnabled: false
        }
      })
    } else {
      await prisma.settings.update({
        where: { id: s.id },
        data: { targetEquityPct: 65, targetBondsPct: 25, targetCashPct: 10, demoModeEnabled: false }
      })
    }
  })

  afterAll(async () => {
    try {
      if (planId) {
        await prisma.sipExecution.deleteMany({ where: { planId } })
        await prisma.advisorJournal.deleteMany({ where: { metadata: { path: ['planId'], equals: planId } } })
        await prisma.allocationPlan.deleteMany({ where: { id: planId } }).catch(() => {})
      }
      await prisma.allocationPlan.deleteMany({ where: { monthYear: MONTH } })
      await prisma.holding.deleteMany({ where: { id: HOLDING_ID } })
    } catch {
      /* */
    }
    await prisma.$disconnect()
  })

  it('generates plan with TAX_FREE_EXIT SELL, PATCH DONE creates SipExecution side SELL + journal', async () => {
    const gen = await request(app).post('/api/this-month/generate-now').send({ monthYear: MONTH }).expect(201)
    planId = gen.body.data.plan.id
    expect(planId).toBeTruthy()

    const cur = await request(app).get(`/api/this-month?monthYear=${encodeURIComponent(MONTH)}`).expect(200)
    expect(cur.body.success).toBe(true)
    const plan = cur.body.data.plan
    expect(plan).toBeTruthy()
    const allocations = (plan.allocations || []) as Array<Record<string, unknown>>

    const sells = allocations.filter((r) => r.type === 'SELL')
    expect(sells).toHaveLength(1)

    const row = sells[0]
    expect(row.sellSubtype).toBe('TAX_FREE_EXIT')
    expect(Number(row.taxImpactCzk ?? -1)).toBe(0)
    expect(Number(row.amountCzk)).toBe(2500)
    expect(row.isin).toBe(ISIN)

    const holding = await prisma.holding.findUnique({ where: { id: HOLDING_ID } })
    expect(Number(holding?.currentValueCzk ?? 0)).toBe(2500)

    const sellIdx = allocations.findIndex((r) => r.type === 'SELL' && r.isin === ISIN)
    expect(sellIdx).toBeGreaterThanOrEqual(0)

    const patch = await request(app)
      .patch(`/api/this-month/plan/${planId}/row/${sellIdx}`)
      .send({
        action: 'DONE',
        executedAmountCzk: 2500,
        executedAt: '2036-04-15T12:00:00.000Z'
      })
      .expect(200)

    const updatedPlan = patch.body.data.plan
    const updRows = (updatedPlan.allocations || []) as Array<{ executionStatus?: string }>
    expect(updRows[sellIdx]?.executionStatus).toBe('DONE')

    const sip = await prisma.sipExecution.findFirst({
      where: { planId, isin: ISIN }
    })
    expect(sip).toBeTruthy()
    expect(sip?.side).toBe('SELL')

    const journal = await prisma.advisorJournal.findFirst({
      where: { category: 'FOLLOWED', relatedIsin: ISIN },
      orderBy: { date: 'desc' }
    })
    expect(journal).toBeTruthy()
    expect(String(journal?.content || '').toLowerCase()).toMatch(/sold|from/i)
  })
})
