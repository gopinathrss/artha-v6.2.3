import './testEnv'
import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'
import { hasTestDatabase, ensureLiveMode } from './helpers'
import { num } from '../../src/lib/money'

describe('POST /api/india/mf NAV field mapping', () => {
  afterAll(async () => {
    if (hasTestDatabase()) await prisma.$disconnect()
  })

  it('maps currentNav → currentNavInr and avgNav → avgNavInr', async () => {
    if (!hasTestDatabase()) return
    await ensureLiveMode()
    const amfiCode = `MAP${Date.now()}`
    await request(app)
      .post('/api/india/mf')
      .send({
        schemeName: 'Nav map API test',
        amfiCode,
        category: 'EQUITY_LARGE',
        units: 1000,
        avgNav: 100,
        currentNav: 110,
        purchaseDate: '2024-01-01'
      })
      .expect(201)

    const row = await prisma.indiaMutualFund.findFirst({ where: { amfiCode } })
    expect(row).not.toBeNull()
    expect(num(row!.currentNavInr)).toBe(110)
    expect(num(row!.avgNavInr)).toBe(100)

    await prisma.indiaMutualFund.delete({ where: { id: row!.id } })
  })

  it('still accepts currentNavInr / avgNavInr on POST', async () => {
    if (!hasTestDatabase()) return
    await ensureLiveMode()
    const amfiCode = `INR${Date.now()}`
    await request(app)
      .post('/api/india/mf')
      .send({
        schemeName: 'Nav INR keys test',
        amfiCode,
        category: 'EQUITY_LARGE',
        units: 10,
        avgNavInr: 50,
        currentNavInr: 55,
        purchaseDate: '2024-06-01'
      })
      .expect(201)

    const row = await prisma.indiaMutualFund.findFirst({ where: { amfiCode } })
    expect(num(row!.currentNavInr)).toBe(55)
    expect(num(row!.avgNavInr)).toBe(50)
    await prisma.indiaMutualFund.delete({ where: { id: row!.id } })
  })
})
