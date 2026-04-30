import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('api income', () => {
  let id: string
  beforeAll(async () => {
    await ensureLiveMode()
  })
  afterAll(async () => {
    if (id) {
      try {
        await prisma.incomeEvent.delete({ where: { id } })
      } catch {
        /* best-effort */
      }
    }
    await prisma.$disconnect()
  })

  it('POST /api/income → 201 and row', async () => {
    const res = await request(app)
      .post('/api/income')
      .send({
        date: '2025-12-15',
        source: 'BONUS',
        amountCzk: 12_345,
        amountLocal: 12_345,
        currency: 'CZK',
        recurring: false
      })
      .expect(201)
    id = res.body.data.event.id
    expect(res.body.data.event.amountCzk).toBe(12_345)
  })

  it('GET /api/income returns an array in data.events', async () => {
    const res = await request(app).get('/api/income').expect(200)
    expect(Array.isArray(res.body.data?.events)).toBe(true)
  })

  it('PUT /api/income/:id updates and returns 200', async () => {
    if (!id) return
    const res = await request(app).put(`/api/income/${id}`).send({ source: 'BONUS2' }).expect(200)
    expect(res.body.data.event.source).toBe('BONUS2')
  })

  it('POST invalid amount → 400', async () => {
    const res = await request(app)
      .post('/api/income')
      .send({ date: '2025-01-01', source: 'X', amountCzk: 'not-a-number' })
    expect(res.status).toBe(400)
  })

  it('DELETE /api/income/:id → 200', async () => {
    if (!id) return
    await request(app).delete(`/api/income/${id}`).expect(200)
  })
})
