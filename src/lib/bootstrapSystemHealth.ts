import type { PrismaClient } from '@prisma/client'

/** One-time friendly row so `/api/health` is not empty on fresh installs (F6.1). */
export async function bootstrapSystemHealth(prisma: PrismaClient): Promise<void> {
  const n = await prisma.systemHealth.count()
  if (n > 0) return
  await prisma.systemHealth.create({
    data: {
      checkName: 'STARTUP',
      status: 'OK',
      message: 'PIE initialised. SystemHealth table seeded.'
    }
  })
}
