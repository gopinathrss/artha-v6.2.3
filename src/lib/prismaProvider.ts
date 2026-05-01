import { PrismaClient } from '@prisma/client'

const realUrl = process.env.DATABASE_URL ?? ''
const demoUrl = process.env.DATABASE_URL_DEMO ?? realUrl

export const realPrisma = new PrismaClient({
  datasources: { db: { url: realUrl } }
})

export const demoPrisma = new PrismaClient({
  datasources: { db: { url: demoUrl } }
})

let cachedDemoState: { value: boolean; fetchedAt: number } | null = null
const DEMO_STATE_CACHE_MS = 5000

export function invalidateDemoStateCache(): void {
  cachedDemoState = null
}

async function isDemoActive(): Promise<boolean> {
  if (cachedDemoState && Date.now() - cachedDemoState.fetchedAt < DEMO_STATE_CACHE_MS) {
    return cachedDemoState.value
  }
  const settings = await realPrisma.settings.findFirst()
  const value = settings?.demoModeEnabled ?? false
  cachedDemoState = { value, fetchedAt: Date.now() }
  return value
}

export async function getPrisma(): Promise<PrismaClient> {
  return (await isDemoActive()) ? demoPrisma : realPrisma
}
