import { PrismaClient } from '@prisma/client'

const realUrl = process.env.DATABASE_URL
if (!realUrl) {
  throw new Error('DATABASE_URL is required.')
}

const demoUrl = process.env.DATABASE_URL_DEMO
if (!demoUrl) {
  throw new Error(
    'DATABASE_URL_DEMO is required for demo mode safety. Set it in .env ' +
      'to a separate database URL (e.g. postgresql://...:5544/artha_v4_demo). ' +
      'See docs/F6_1_DEMO_ISOLATION.md for setup.'
  )
}

if (realUrl === demoUrl) {
  throw new Error(
    'DATABASE_URL and DATABASE_URL_DEMO must point to different databases. ' +
      'Demo isolation requires a separate DB.'
  )
}

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
