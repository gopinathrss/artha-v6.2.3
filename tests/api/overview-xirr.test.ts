import './testEnv'
import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('GET /api/overview metrics shape (Area 2)', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('xirr has Shape A fields; netWorth uses inflow-weighted names; momChange has tier', async () => {
    const res = await request(app).get('/api/overview').expect(200)
    expect(res.body.success).toBe(true)
    const d = res.body.data
    expect(d).toBeTruthy()
    const x = d.xirr
    expect(x).toBeTruthy()
    expect(x).toHaveProperty('displayValue')
    expect(x).toHaveProperty('displayLabel')
    expect(x).toHaveProperty('displayState')
    expect(x).toHaveProperty('rawEstimate')
    expect(x).toHaveProperty('monthsOfHistory')
    expect(x).toHaveProperty('minMonthsForDisplay')
    expect(x).not.toHaveProperty('value')

    const nw = d.netWorth
    expect(nw).toHaveProperty('inflowWeightedGainCzk')
    expect(nw).toHaveProperty('inflowWeightedGainPct')
    expect(nw).not.toHaveProperty('gainCzk')
    expect(nw).not.toHaveProperty('gainPct')

    const mom = d.momChange
    expect(mom).toHaveProperty('label')
    expect(mom).toHaveProperty('tier')
  })
})
