import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { pruneOldRows } from '../../src/lib/cron/pruneOldRows'

function mockPrisma() {
  return {
    settings: {
      findFirst: vi.fn().mockResolvedValue({
        cronExecutionRetentionDays: 90,
        systemHealthRetentionDays: 60,
        emailPreviewRetentionDays: 30,
        alertLogDismissedRetentionDays: 90
      })
    },
    cronExecution: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    systemHealth: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    emailIngestionPreview: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    alertLog: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) }
  }
}

describe('pruneOldRows', () => {
  it('calls deleteMany with retention cutoffs', async () => {
    const prisma = mockPrisma() as unknown as PrismaClient
    const r = await pruneOldRows(prisma)
    expect(r.cronDeleted).toBe(1)
    expect(r.healthDeleted).toBe(2)
    expect(r.emailDeleted).toBe(3)
    expect(r.alertDeleted).toBe(4)
    expect(prisma.emailIngestionPreview.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['APPROVED', 'REJECTED', 'AUTO_INGESTED'] }
        })
      })
    )
  })
})
