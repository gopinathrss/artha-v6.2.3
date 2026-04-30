import './testEnv'
import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { hasTestDatabase } from './helpers'
import { prisma } from '../../src/lib/prisma'
import app from '../../src/api/server'

/** Health endpoint must return 200 even when Postgres is down (degraded checks). */
describe('api health', () => {
  afterAll(async () => {
    if (hasTestDatabase()) await prisma.$disconnect()
  })

  it('GET /api/health has 12 checks and trust score', async () => {
    const res = await request(app).get('/api/health').expect(200)
    const d = res.body.data
    expect(d.checks.length).toBe(12)
    expect(typeof d.trustScore).toBe('number')
    d.checks.forEach((c: { status: string }) => {
      expect(['PASS', 'WARN', 'FAIL']).toContain(c.status)
    })
  })
})
