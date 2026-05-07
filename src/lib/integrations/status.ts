import type { PrismaClient } from '@prisma/client'

export async function writeIntegrationStatus(
  prisma: PrismaClient,
  opts: {
    providerKey: string
    status: 'OK' | 'FAIL' | 'WARN'
    source: 'test' | 'live-call' | 'background-check'
    message?: string
    metadata?: object
    latencyMs?: number
  }
): Promise<void> {
  await prisma.integrationStatus.create({
    data: {
      providerKey: opts.providerKey,
      status: opts.status,
      source: opts.source,
      message: opts.message ?? null,
      metadata: opts.metadata as object | undefined,
      latencyMs: opts.latencyMs ?? null
    }
  })
}

export async function recentIntegrationStatus(
  prisma: PrismaClient,
  providerKey: string,
  n = 10
) {
  return prisma.integrationStatus.findMany({
    where: { providerKey },
    orderBy: { testedAt: 'desc' },
    take: n
  })
}
