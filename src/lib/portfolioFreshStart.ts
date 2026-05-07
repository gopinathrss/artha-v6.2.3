import type { PrismaClient } from '@prisma/client'

/** Tables left intact when wiping personal portfolio data (main `DATABASE_URL` only). */
const SKIP_TRUNCATE = new Set([
  '_prisma_migrations',
  'Settings',
  'AppSettings',
  'IntegrationProvider',
  'InstrumentLibrary'
])

/**
 * Truncates portfolio and derived data on the **personal** database (`realPrisma`).
 * Does not run when demo mode is on — caller must check first.
 */
export async function wipePersonalPortfolioTables(prisma: PrismaClient): Promise<{ tables: string[] }> {
  const tabRows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  const tables = tabRows.map((r) => r.tablename).filter((t) => !SKIP_TRUNCATE.has(t))
  if (tables.length === 0) return { tables: [] }
  const list = tables.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
  return { tables }
}

export async function markOnboardingIncomplete(prisma: PrismaClient): Promise<void> {
  const s = await prisma.settings.findFirst({ orderBy: { createdAt: 'asc' } })
  if (s) {
    await prisma.settings.update({
      where: { id: s.id },
      data: { onboardingComplete: false } as never
    })
  }
  try {
    await prisma.appSettings.update({
      where: { id: 'default' },
      data: { onboardingComplete: false } as never
    })
  } catch {
    /* AppSettings row may not exist */
  }
}
