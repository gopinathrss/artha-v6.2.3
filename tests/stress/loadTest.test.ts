import { describe, expect, it, vi } from 'vitest'
import { calculateXIRR } from '../../src/lib/calculations'
import { buildMonthlyPlanPayload } from '../../src/lib/allocationPlanner'

const prismaMock = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  incomeEvent: { findMany: vi.fn() },
  expenseCommitment: { findMany: vi.fn() },
  upcomingEvent: { findMany: vi.fn() },
  settings: { findFirst: vi.fn() },
  holding: { findMany: vi.fn() },
  account: { findMany: vi.fn() },
  indiaMutualFund: { findMany: vi.fn() },
  indiaFixedDeposit: { findMany: vi.fn() },
  allocationPlan: { findFirst: vi.fn().mockResolvedValue(null) }
}))

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
  realPrisma: prismaMock,
  demoPrisma: prismaMock,
  getPrisma: vi.fn(async () => prismaMock),
  invalidateDemoStateCache: vi.fn()
}))
vi.mock('../../src/lib/instrumentLibrary', () => ({
  loadAllLibrary: vi.fn(async () => [
    { isin: 'IE1', name: 'World', category: 'EQUITY', score: 90, terPct: 0.2, availableInGeorge: true, return3yr: 10 },
    { isin: 'IE2', name: 'Bond', category: 'BONDS', score: 80, terPct: 0.3, availableInGeorge: true, return3yr: 3 }
  ]),
  scoreInstrument: (i: { score?: number }) => i.score ?? 0
}))

describe('stress: load (no production traffic — in-process)', () => {
  it('repeated XIRR in a loop is stable', () => {
    const cf = [
      { date: new Date(2020, 0, 1), amount: -1000 },
      { date: new Date(2021, 0, 1), amount: 1200 }
    ]
    for (let i = 0; i < 500; i++) {
      const r = calculateXIRR(cf, new Date(2021, 0, 1), 0)
      expect(r.cashflowCount).toBeGreaterThan(0)
    }
  })

  it('100 plan generations with mocks', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      id: 'default',
      fullName: 'S',
      dateOfBirth: new Date('1990-01-01'),
      homeCurrency: 'CZK',
      taxResidency: 'CZ',
      riskProfile: 'MODERATE',
      monthlyNetIncomeCzk: 50_000,
      salaryDayOfMonth: 15,
      emergencyFundTarget: 200_000,
      retirementAge: 50,
      retirementMonthlyExpense: 20_000
    } as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([] as never)
    prismaMock.expenseCommitment.findMany.mockResolvedValue([] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue({ id: 's' } as never)
    prismaMock.holding.findMany.mockResolvedValue([] as never)
    prismaMock.indiaMutualFund.findMany.mockResolvedValue([] as never)
    prismaMock.indiaFixedDeposit.findMany.mockResolvedValue([] as never)
    prismaMock.account.findMany.mockResolvedValue([
      { type: 'SAVINGS', balanceCzkSnapshot: 0, isActive: true, balanceLocal: 0, currency: 'CZK' }
    ] as never)
    for (let j = 0; j < 100; j++) {
      const p = await buildMonthlyPlanPayload('2026-01')
      expect(p.allocations.length).toBeGreaterThan(0)
    }
  })
})
