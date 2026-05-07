import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPlanAllocationsOrEmpty } from '../../src/lib/planAllocationsRead'

const createHealth = vi.fn().mockResolvedValue({})

vi.mock('../../src/lib/prisma', () => ({
  getPrisma: vi.fn(async () => ({
    systemHealth: { create: createHealth }
  }))
}))

describe('readPlanAllocationsOrEmpty', () => {
  beforeEach(() => {
    createHealth.mockClear()
  })

  it('returns [] and logs SystemHealth on corrupt allocations', async () => {
    const rows = await readPlanAllocationsOrEmpty({
      id: 'plan-bad',
      allocations: { notAnArray: true }
    })
    expect(rows).toEqual([])
    expect(createHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkName: 'PLAN_READER', status: 'FAIL' })
      })
    )
  })
})
