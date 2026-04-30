import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import { getPortfolioSummary } from '../../src/lib/portfolio'
import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('api intelligence (no external keys — persisted fallback)', () => {
  beforeAll(async () => {
    await ensureLiveMode()
    const d = new Date('1990-01-15')
    const t = new Date()
    t.setFullYear(t.getFullYear() + 3)
    await prisma.userProfile.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        fullName: 'AI Test',
        dateOfBirth: d,
        homeCurrency: 'CZK',
        taxResidency: 'CZ',
        riskProfile: 'MODERATE',
        monthlyNetIncomeCzk: 100_000,
        salaryDayOfMonth: 15,
        emergencyFundTarget: 200_000,
        retirementAge: 60,
        retirementMonthlyExpense: 30_000
      },
      update: {}
    })
    const c = await prisma.holding.count({ where: { status: { not: 'EXITED' } } })
    if (c === 0) {
      await prisma.holding.create({
        data: {
          isin: 'CZ000AI1',
          name: 'Test fund',
          category: 'EQUITY',
          units: 1,
          nav: 100,
          currentValueCzk: 10_000,
          status: 'ACTIVE',
          purchaseStartDate: new Date('2020-01-01'),
          taxFreeDate: new Date('2024-01-01'),
          country: 'CZ',
          type: 'MUTUAL_FUND',
          currency: 'CZK'
        }
      })
    }
    const ps = await getPortfolioSummary()
    if (!ps.success) {
      throw new Error(String(ps.error || 'getPortfolioSummary failed (needed for /intelligence)'))
    }
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('POST /api/intelligence/ask returns memory id and stores row', async () => {
    const res = await request(app)
      .post('/api/intelligence/ask')
      .send({ question: `Sprint4 no-cache ${Date.now()} ${'x'.repeat(12)}` })
      .expect(200)
    const mem = res.body.data?.memory
    expect(mem?.id).toBeTruthy()
    const row = await prisma.aIMemory.findUnique({ where: { id: mem.id } })
    expect(row?.id).toBe(mem.id)
  })

  it('POST feedback updates AIMemory', async () => {
    const m = await prisma.aIMemory.create({
      data: {
        questionAsked: 'q',
        questionType: 'G',
        portfolioSnapshot: {} as object,
        aiResponse: 'a',
        keyNumbers: [] as object,
        recommendations: {} as object,
        confidenceScore: 0
      }
    })
    const res = await request(app)
      .post('/api/intelligence/feedback')
      .send({ memoryId: m.id, feedback: 'HELPFUL' })
      .expect(200)
    expect(res.body.data.memory.userFeedback).toBe('HELPFUL')
  })
})
