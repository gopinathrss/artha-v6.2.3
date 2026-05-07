import { describe, expect, it, vi } from 'vitest'
import { HEALTH_CHECK_COUNT, runHealthChecks } from '../../src/lib/health'

function trustFromCheckRows(rows: { status: 'PASS' | 'WARN' | 'FAIL' }[]) {
  const pass = rows.filter((c) => c.status === 'PASS').length
  const warn = rows.filter((c) => c.status === 'WARN').length
  return Math.min(100, Math.round((pass * 100 + warn * 50) / HEALTH_CHECK_COUNT))
}

describe('health trust score math', () => {
  it('all PASS → 100', () => {
    const rows = Array.from({ length: HEALTH_CHECK_COUNT }, () => ({ status: 'PASS' as const }))
    expect(trustFromCheckRows(rows)).toBe(100)
  })
  it('all FAIL → 0', () => {
    const rows = Array.from({ length: HEALTH_CHECK_COUNT }, () => ({ status: 'FAIL' as const }))
    expect(trustFromCheckRows(rows)).toBe(0)
  })
  it('6 PASS 11 WARN → trust / HEALTH_CHECK_COUNT (18 checks)', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ status: 'PASS' as const })),
      ...Array.from({ length: 11 }, () => ({ status: 'WARN' as const }))
    ]
    expect(trustFromCheckRows(rows)).toBe(64)
  })
  it('HEALTH_CHECK_COUNT is 18', () => {
    expect(HEALTH_CHECK_COUNT).toBe(18)
  })
})

const prismaHealth = vi.hoisted(() => ({
  fXRate: { findFirst: vi.fn() },
  navHistory: { findFirst: vi.fn() },
  holding: { findMany: vi.fn() },
  indiaIntelligence: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  settings: { findFirst: vi.fn() },
  userProfile: { findUnique: vi.fn() },
  instrumentLibrary: { count: vi.fn() },
  snapshot: { findFirst: vi.fn() },
  allocationPlan: { findFirst: vi.fn() },
  systemHealth: { findFirst: vi.fn(), count: vi.fn() },
  cronExecution: { count: vi.fn(), findFirst: vi.fn() },
  advisorJournal: { findFirst: vi.fn() }
}))

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaHealth,
  realPrisma: prismaHealth,
  demoPrisma: prismaHealth,
  getPrisma: vi.fn(async () => prismaHealth),
  invalidateDemoStateCache: vi.fn()
}))

describe('runHealthChecks (mocked prisma)', () => {
  it('returns 18 checks and valid trust', async () => {
    const now = new Date()
    prismaHealth.fXRate.findFirst.mockResolvedValue({ fetchedAt: now, base: 'CZK', quote: 'EUR' } as never)
    prismaHealth.navHistory.findFirst.mockResolvedValue({ date: now } as never)
    prismaHealth.holding.findMany.mockResolvedValue([] as never)
    prismaHealth.indiaIntelligence.findFirst.mockResolvedValue({ validFrom: now } as never)
    prismaHealth.$queryRaw.mockResolvedValue(1)
    prismaHealth.settings.findFirst.mockResolvedValue({ smtpUser: null, smtpPass: null, openaiApiKey: null } as never)
    prismaHealth.userProfile.findUnique.mockResolvedValue({ monthlyNetIncomeCzk: 0 } as never)
    prismaHealth.instrumentLibrary.count.mockResolvedValue(25)
    prismaHealth.snapshot.findFirst.mockResolvedValue({ date: now } as never)
    prismaHealth.allocationPlan.findFirst.mockResolvedValue({ status: 'PROPOSED', generatedAt: now, monthYear: '2026-01' } as never)
    prismaHealth.systemHealth.findFirst.mockResolvedValue({ lastSuccessful: now, checkedAt: now, checkName: 'WEEKLY_BACKUP' } as never)
    prismaHealth.systemHealth.count.mockResolvedValue(0)
    prismaHealth.cronExecution.count.mockResolvedValue(0)
    prismaHealth.cronExecution.findFirst.mockResolvedValue({ startedAt: now } as never)
    prismaHealth.advisorJournal.findFirst.mockResolvedValue(null)
    const h = await runHealthChecks()
    expect(h.checks.length).toBe(18)
    h.checks.forEach((c) => {
      expect(['PASS', 'WARN', 'FAIL']).toContain(c.status)
    })
    expect(h.trustScore).toBeGreaterThanOrEqual(0)
    expect(h.trustScore).toBeLessThanOrEqual(100)
  })
})
