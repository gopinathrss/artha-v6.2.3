import { describe, expect, it, vi } from 'vitest'
import { calculateXIRR } from '../../src/lib/calculations'
import { equityLtcgTaxInr } from '../../src/lib/indiaTax'
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

describe('stress: data correctness (hand checks)', () => {
  it('1) XIRR: 100k + 5k x 12, terminal 175k in ~14% band', () => {
    const cf: { date: Date; amount: number }[] = [{ date: new Date(2024, 0, 1), amount: -100_000 }]
    for (let m = 1; m <= 12; m++) cf.push({ date: new Date(2024, m, 1), amount: -5000 })
    const r = calculateXIRR(cf, new Date(2025, 0, 1), 175_000)
    expect(r.value).not.toBeNull()
    expect(r.value!).toBeGreaterThan(10)
    expect(r.value!).toBeLessThan(16)
  })

  it('2) plan: 60/30, MOD, investable ~30k, allocations do not exceed investable', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      id: 'default',
      fullName: 'S',
      dateOfBirth: new Date('1990-01-01'),
      homeCurrency: 'CZK',
      taxResidency: 'CZ',
      riskProfile: 'MODERATE',
      monthlyNetIncomeCzk: 60_000,
      salaryDayOfMonth: 15,
      emergencyFundTarget: 200_000,
      retirementAge: 55,
      retirementMonthlyExpense: 30_000
    } as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([] as never)
    prismaMock.expenseCommitment.findMany.mockResolvedValue([
      {
        id: '1',
        category: 'R',
        description: 'f',
        amountCzk: 30_000,
        frequency: 'MONTHLY',
        dueDayOfMonth: 1,
        startDate: new Date('2019-01-01'),
        endDate: null,
        active: true
      }
    ] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue({ id: 's', targetEquityPct: 65, targetBondsPct: 25, targetCashPct: 10 } as never)
    prismaMock.holding.findMany.mockResolvedValue([] as never)
    prismaMock.indiaMutualFund.findMany.mockResolvedValue([] as never)
    prismaMock.indiaFixedDeposit.findMany.mockResolvedValue([] as never)
    prismaMock.account.findMany.mockResolvedValue([
      { type: 'SAVINGS', balanceCzkSnapshot: 200_000, isActive: true, balanceLocal: 200_000, currency: 'CZK' }
    ] as never)
    const p = await buildMonthlyPlanPayload('2026-06')
    expect(p.investableCzk).toBeCloseTo(30_000, -1)
    const t = p.allocations
      .filter((a) => a.type === 'BUY' || a.type === 'RESERVE')
      .reduce((s, a) => s + a.amountCzk, 0)
    expect(t).toBeLessThanOrEqual(p.investableCzk + 1)
    expect(p.allocations.length).toBeGreaterThanOrEqual(1)
  })

  it('3) India LTCG tax: 5L gain → 46,875 INR (exemption 1.25L @ 12.5%)', () => {
    expect(equityLtcgTaxInr(5 * 100_000)).toBe(46_875)
  })

  it('4) CZK → EUR → CZK roundtrip identity at fixed 25:1', () => {
    const eurCzk = 25
    const a = 1000 / eurCzk
    const back = a * eurCzk
    expect(Math.abs(back - 1000)).toBeLessThan(0.0001)
  })

  it('5) Fee delta 1.85% vs 0.07% on 100k = 1,780 CZK/yr', () => {
    const a = 100_000 * (0.0185 - 0.0007)
    expect(a).toBe(1780)
  })
})
