import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('api expenses', () => {
  let id: string
  beforeAll(async () => {
    await ensureLiveMode()
  })
  afterAll(async () => {
    if (id) {
      try {
        await prisma.expenseCommitment.delete({ where: { id } })
      } catch {
        /* */
      }
    }
    await prisma.$disconnect()
  })

  it('POST /api/expenses 201', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({
        category: 'UTILS',
        description: 'Elec',
        amountCzk: 2000,
        frequency: 'MONTHLY',
        startDate: '2024-01-01'
      })
      .expect(201)
    id = res.body.data.expense.id
  })

  it('GET /api/expenses 200 with array', async () => {
    const res = await request(app).get('/api/expenses').expect(200)
    expect(Array.isArray(res.body.data?.expenses)).toBe(true)
  })

  it('PUT /api/expenses/:id 200', async () => {
    if (!id) return
    const res = await request(app)
      .patch(`/api/expenses/${id}`)
      .send({ amountCzk: 2100 })
      .expect(200)
    expect(res.body.data.expense.amountCzk).toBe(2100)
  })

  it('DELETE 200', async () => {
    if (!id) return
    await request(app).delete(`/api/expenses/${id}`).expect(200)
  })
})
