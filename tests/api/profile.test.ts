import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'

import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('api profile', () => {
  beforeAll(async () => {
    await ensureLiveMode()
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('GET /api/profile returns 200 and a profile (auto-create)', async () => {
    const res = await request(app).get('/api/profile').expect(200)
    expect(res.body?.success).toBe(true)
    expect(res.body?.data?.profile?.id).toBe('default')
  })

  it('GET /api/profile/status returns structure', async () => {
    const res = await request(app).get('/api/profile/status').expect(200)
    expect(res.body?.data?.hasProfile).toBe(true)
  })

  it('POST /api/profile/onboarding-complete with valid body returns 200 and planId', async () => {
    const res = await request(app)
      .post('/api/profile/onboarding-complete')
      .send({
        profile: {
          fullName: 'API Test',
          dateOfBirth: '1990-04-15',
          taxResidency: 'CZ',
          homeCurrency: 'CZK',
          monthlyNetIncomeCzk: 80_000,
          salaryDayOfMonth: 15,
          riskProfile: 'MODERATE',
          retirementAge: 55,
          retirementMonthlyExpense: 40_000,
          emergencyFundTarget: 200_000,
          targetEquityPct: 65,
          targetBondsPct: 25,
          targetCashPct: 10
        },
        expenses: [
          {
            category: 'RENT',
            description: 'Rent',
            amountCzk: 30_000,
            dueDayOfMonth: 1
          }
        ],
        events: []
      })
      .expect(200)
    expect(res.body?.data?.planId).toBeTruthy()
  })
})
