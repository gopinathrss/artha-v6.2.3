import './testEnv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ensureLiveMode, hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

const run = hasTestDatabase()

describe.skipIf(!run)('api events', () => {
  let id: string
  beforeAll(async () => {
    await ensureLiveMode()
  })
  afterAll(async () => {
    if (id) {
      try {
        await prisma.upcomingEvent.delete({ where: { id } })
      } catch {
        /* */
      }
    }
    await prisma.$disconnect()
  })

  it('POST /api/events 201', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({
        title: 'Trip',
        eventDate: '2027-06-01',
        category: 'TRIP',
        budgetCzk: 20_000,
        status: 'UPCOMING'
      })
      .expect(201)
    id = res.body.data.event.id
  })

  it('GET 200 with array', async () => {
    const res = await request(app).get('/api/events').expect(200)
    expect(Array.isArray(res.body.data?.events)).toBe(true)
  })

  it('PUT 200', async () => {
    if (!id) return
    const res = await request(app)
      .put(`/api/events/${id}`)
      .send({ reservedCzk: 2000 })
      .expect(200)
    expect(res.body.data.event.reservedCzk).toBe(2000)
  })

  it('DELETE 200', async () => {
    if (!id) return
    await request(app).delete(`/api/events/${id}`).expect(200)
  })
})
