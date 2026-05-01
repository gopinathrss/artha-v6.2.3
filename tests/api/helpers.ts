import { realPrisma } from '../../src/lib/prisma'

/**
 * API integration tests need a live Postgres matching `DATABASE_URL`.
 * Set `ARTHA_TEST_DB_LIVE=1` locally (or in CI) when the DB is up; otherwise suites skip cleanly.
 */
export const hasTestDatabase = () =>
  process.env.ARTHA_TEST_DB_LIVE === '1' && Boolean(process.env.DATABASE_URL)

export async function ensureLiveMode(): Promise<void> {
  if (!hasTestDatabase()) return
  let s = await realPrisma.settings.findFirst()
  if (!s) s = await realPrisma.settings.create({ data: { demoModeEnabled: false } })
  else if (s.demoModeEnabled) {
    await realPrisma.settings.update({ where: { id: s.id }, data: { demoModeEnabled: false } })
  }
}

export async function ensureLibraryForPlans(): Promise<void> {
  if (!hasTestDatabase()) return
  const { seedLibraryWithTopETFs } = await import('../../src/lib/instrumentLibrary')
  await seedLibraryWithTopETFs()
}
