import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  fetchErsteNav: vi.fn(),
  fetchYahooNav: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn()
}))

const prismaNav = vi.hoisted(() => ({
  holding: {
    findMany: (...a: unknown[]) => mocks.findMany(...a),
    update: (...a: unknown[]) => mocks.update(...a)
  },
  navHistory: { upsert: (...a: unknown[]) => mocks.upsert(...a) }
}))

vi.mock('../../src/lib/nav/erste', () => ({ fetchErsteNav: mocks.fetchErsteNav }))
vi.mock('../../src/lib/nav/yahoo', () => ({ fetchYahooNav: mocks.fetchYahooNav }))
vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaNav,
  realPrisma: prismaNav,
  demoPrisma: prismaNav,
  getPrisma: vi.fn(async () => prismaNav),
  invalidateDemoStateCache: vi.fn()
}))

import { refreshAllCzechNavs, refreshNavForIsins } from '../../src/lib/nav/refreshAll'

describe('refreshAllCzechNavs', () => {
  beforeEach(() => {
    mocks.fetchErsteNav.mockReset()
    mocks.fetchYahooNav.mockReset()
    mocks.findMany.mockReset()
    mocks.update.mockReset()
    mocks.upsert.mockReset()
  })

  it('skips holdings without nav source', async () => {
    mocks.findMany.mockResolvedValue([{ id: '1', isin: 'X', currency: 'CZK', units: new Prisma.Decimal(10), navSourceType: null, navSourceId: null, status: 'ACTIVE' }])
    const r = await refreshAllCzechNavs()
    expect(r.skipped).toBe(1)
    expect(r.refreshed).toBe(0)
    expect(mocks.fetchErsteNav).not.toHaveBeenCalled()
  })

  it('refreshes ERSTE holding and upserts NavHistory', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'h1',
        isin: 'CZ0001',
        currency: 'CZK',
        units: new Prisma.Decimal(100),
        navSourceType: 'ERSTE',
        navSourceId: 'N1',
        status: 'ACTIVE'
      }
    ])
    mocks.fetchErsteNav.mockResolvedValue({ value: new Prisma.Decimal(1.5), fetchedAt: new Date() })
    mocks.update.mockResolvedValue({})
    mocks.upsert.mockResolvedValue({})

    const r = await refreshAllCzechNavs()
    expect(r.refreshed).toBe(1)
    expect(mocks.fetchErsteNav).toHaveBeenCalledWith('N1')
    expect(mocks.update).toHaveBeenCalled()
    expect(mocks.upsert).toHaveBeenCalled()
  })

  it('refreshNavForIsins queries by isin list', async () => {
    mocks.findMany.mockResolvedValue([])
    await refreshNavForIsins(['CZ0001', 'CZ0001'])
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isin: { in: ['CZ0001'] },
          units: { gt: 0 }
        })
      })
    )
  })
})
