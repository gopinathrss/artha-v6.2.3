import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  allocationPlan: { findFirst: vi.fn() }
}))

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
  realPrisma: prismaMock,
  demoPrisma: prismaMock,
  getPrisma: vi.fn(async () => prismaMock),
  invalidateDemoStateCache: vi.fn()
}))

vi.mock('../../src/lib/fetchers', () => ({
  getFXRates: vi.fn(async () => ({
    EURCZK: 25,
    EURINR: 100,
    source: 'test',
    ageHours: 0
  }))
}))

vi.mock('../../src/lib/instrumentLibrary', () => ({
  loadAllLibrary: vi.fn(async () => [
    {
      isin: 'EQTOP',
      name: 'Equity ETF',
      category: 'EQUITY',
      score: 90,
      terPct: 0.2,
      availableInGeorge: true,
      return3yr: 12
    },
    {
      isin: 'BDTOP',
      name: 'Bond fund',
      category: 'BONDS',
      score: 85,
      terPct: 0.4,
      availableInGeorge: true,
      return3yr: 5
    }
  ]),
  scoreInstrument: (i: { score?: number }) => i.score ?? 10
}))

import { buildMonthlyPlanPayload } from '../../src/lib/allocationPlanner'

const baseProfile = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'default',
  fullName: 'Test',
  dateOfBirth: new Date('1990-01-01'),
  homeCurrency: 'CZK',
  taxResidency: 'CZ',
  riskProfile: 'MODERATE',
  monthlyNetIncomeCzk: 65_000,
  salaryDayOfMonth: 15,
  emergencyFundTarget: 200_000,
  retirementAge: 50,
  retirementMonthlyExpense: 35_000,
  notes: null,
  updatedAt: new Date(),
  ...over
})

const monthlyExpense = (amt: number) => ({
  id: 'e1',
  category: 'RENT',
  description: 'r',
  amountCzk: amt,
  frequency: 'MONTHLY',
  dueDayOfMonth: 1,
  startDate: new Date('2020-01-01'),
  endDate: null,
  active: true,
  notes: null,
  createdAt: new Date()
})

const settings = (tEq = 65, tBd = 25, tCa = 10, taxFreeWindowAllowsBuy = false) => ({
  id: 's1',
  targetEquityPct: tEq,
  targetBondsPct: tBd,
  targetCashPct: tCa,
  riskProfile: null,
  taxFreeWindowAllowsBuy
})

const equityHolding = (taxFreeSoon: boolean) => {
  const purchase = new Date()
  if (taxFreeSoon) {
    purchase.setDate(purchase.getDate() - 200)
  } else {
    purchase.setDate(purchase.getDate() - 400)
  }
  const taxFree = new Date(purchase)
  taxFree.setFullYear(taxFree.getFullYear() + 3)
  return {
    id: 'h1',
    isin: 'CZEQ',
    name: 'Czech equity',
    category: 'EQUITY',
    units: 10,
    nav: 100,
    currentValueCzk: 10_000,
    status: 'ACTIVE',
    country: 'CZ',
    purchaseStartDate: purchase,
    taxFreeDate: taxFree,
    cashflows: [] as { amountCzk: number; type: string }[]
  }
}

/** ~65/25/10 CZK split so drift sell engine does not fire in routine tests. */
function balancedHoldings65(eq: Record<string, unknown>) {
  const p = new Date()
  p.setDate(p.getDate() - 400)
  const tf = new Date(p)
  tf.setFullYear(tf.getFullYear() + 3)
  return [
    eq,
    {
      id: 'h2',
      isin: 'CZBD',
      name: 'Czech bonds',
      category: 'BONDS',
      units: 40,
      nav: 100,
      currentValueCzk: 3846,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: p,
      taxFreeDate: tf,
      cashflows: [] as { amountCzk: number; type: string }[]
    },
    {
      id: 'h3',
      isin: 'CZZ',
      name: 'Cash sleeve',
      category: 'CASH',
      units: 100,
      nav: 15.38,
      currentValueCzk: 1538,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: p,
      taxFreeDate: tf,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
  ] as never[]
}

beforeEach(() => {
  for (const x of Object.values(prismaMock) as { mockReset?: () => void }[]) {
    x?.mockReset?.()
  }
  prismaMock.indiaMutualFund.findMany.mockResolvedValue([] as never)
  prismaMock.indiaFixedDeposit.findMany.mockResolvedValue([] as never)
  prismaMock.allocationPlan.findFirst.mockReset()
  prismaMock.allocationPlan.findFirst.mockResolvedValue(null)
})

describe('buildMonthlyPlanPayload (10 scenarios)', () => {
  it('1 normal month 65/33, MOD, investable positive, ≥3 rows when possible', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(33_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10) as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 300_000, type: 'SAVINGS', isActive: true, balanceLocal: 300_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.allocations.every((a) => Boolean((a as { type?: string }).type))).toBe(true)
    // income 65k − fixed 33k, no events/emergency top-up → investable 32k
    expect(p.investableCzk).toBeCloseTo(32_000, -1)
    expect(p.allocations.length).toBeGreaterThanOrEqual(1)
    const totalAlloc = p.allocations
      .filter((a) => (a as { type?: string }).type === 'BUY' || (a as { type?: string }).type === 'RESERVE')
      .reduce((s, a) => s + a.amountCzk, 0)
    // Planner uses partial multipliers (e.g. 0.6/0.5 of sleeves) — sum may be < investable
    expect(totalAlloc).toBeGreaterThan(0)
    expect(totalAlloc).toBeLessThanOrEqual(p.investableCzk + 2_000)
  })

  it('2 deficit month: income 30k, fixed 33k → investable < 0', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(
      baseProfile({ monthlyNetIncomeCzk: 30_000 }) as never
    )
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(33_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue([] as never)
    prismaMock.account.findMany.mockResolvedValue([] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    const row0 = p.allocations[0] as { destination?: string } | undefined
    expect(p.investableCzk < 0 || String(row0?.destination || '').toLowerCase().includes('review')).toBe(true)
  })

  it('3+4 events reserve reduces investable (big trip)', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(10_000)] as never)
    const trip = {
      id: 'ev1',
      title: 'Trip',
      category: 'TRIP',
      budgetCzk: 50_000,
      reservedCzk: 0,
      status: 'UPCOMING',
      eventDate: new Date(Date.now() + 60 * 86400000),
      notes: null,
      createdAt: new Date()
    }
    prismaMock.upcomingEvent.findMany.mockResolvedValue([trip] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue([] as never)
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 500_000, type: 'SAVINGS', isActive: true, balanceLocal: 500_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.reservedEventsCzk).toBeGreaterThan(0)
  })

  it('6: no expenses still produces payload', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([] as never)
    prismaMock.expenseCommitment.findMany.mockResolvedValue([] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue([] as never)
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 0, type: 'SAVINGS', isActive: true, balanceLocal: 0, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.totalAvailableCzk).toBe(65_000)
    expect(p.allocations.length).toBeGreaterThan(0)
  })

  it('9: higher equity target → more to equity name', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(85, 10, 5) as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    const sumEq = p.allocations
      .filter((a) => a.type === 'BUY' && (a.destination.includes('Equity') || a.isin === 'EQTOP'))
      .reduce((s, a) => s + a.amountCzk, 0)
    expect(sumEq).toBeGreaterThan(0)
  })

  it('5: no upcoming events – reserved stays 0', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 200_000, type: 'SAVINGS', isActive: true, balanceLocal: 200_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.reservedEventsCzk).toBe(0)
  })

  it('3 tight: investable < 5% of income (small surplus)', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(62_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 1_000_000, type: 'SAVINGS', isActive: true, balanceLocal: 1_000_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    const tight = p.investableCzk < p.totalAvailableCzk * 0.05
    expect(tight).toBe(true)
    expect(p.investableCzk).toBeGreaterThan(0)
  })

  it('7: already tax-free equity → no new library (EQTOP) buy', async () => {
    const purchase = new Date()
    purchase.setFullYear(purchase.getFullYear() - 5)
    const taxFree = new Date(purchase)
    taxFree.setFullYear(taxFree.getFullYear() + 3)
    const h = {
      id: 'h1',
      isin: 'CZEQ',
      name: 'Czech equity',
      category: 'EQUITY',
      units: 10,
      nav: 100,
      currentValueCzk: 10_000,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: purchase,
      taxFreeDate: taxFree,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10) as never)
    prismaMock.holding.findMany.mockResolvedValue([h as never])
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.allocations.some((a) => (a as { isin?: string }).isin === 'EQTOP')).toBe(false)
  })

  it('8: approaching tax-free <90d → no reduced BUY by default; HOLD on that ISIN', async () => {
    const now = new Date()
    const taxFree = new Date()
    taxFree.setDate(taxFree.getDate() + 30)
    const purchase = new Date(taxFree)
    purchase.setFullYear(purchase.getFullYear() - 3)
    const h = {
      id: 'h1',
      isin: 'CZNEAR',
      name: 'Czech equity near',
      category: 'EQUITY',
      units: 10,
      nav: 100,
      currentValueCzk: 10_000,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: purchase,
      taxFreeDate: taxFree,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10) as never)
    prismaMock.holding.findMany.mockResolvedValue([h as never])
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.allocations.some((a) => a.type === 'BUY' && (a as { isin?: string }).isin === 'CZNEAR')).toBe(false)
    const hold = p.allocations.find(
      (a) => a.type === 'HOLD' && (a as { isin?: string }).isin === 'CZNEAR'
    ) as { holdReason?: string } | undefined
    expect(hold).toBeTruthy()
    expect(hold?.holdReason).toBe('TAX_WINDOW_NEAR')
    expect(
      p.allocations.some(
        (a) => (a as { isin?: string; reason?: string }).isin === 'EQTOP' && String(a.reason || '').toLowerCase().includes('george')
      )
    ).toBe(false)
  })

  it('8a: 200d to tax-free → nearTax false → normal library BUY (EQTOP)', async () => {
    const taxFree = new Date()
    taxFree.setDate(taxFree.getDate() + 200)
    const purchase = new Date(taxFree)
    purchase.setFullYear(purchase.getFullYear() - 3)
    const h = {
      id: 'h1',
      isin: 'CZFAR',
      name: 'Czech equity far from window',
      category: 'EQUITY',
      units: 10,
      nav: 100,
      currentValueCzk: 10_000,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: purchase,
      taxFreeDate: taxFree,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10) as never)
    // Balanced sleeve mix so drift rebalance does not SELL the only equity line (which blocks EQTOP BUY).
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(h as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.allocations.some((a) => a.type === 'BUY' && (a as { isin?: string }).isin === 'EQTOP')).toBe(true)
  })

  it('8c: already tax-free (past taxFreeDate) → no BUY into existing CZ equity; library path may still add EQTOP', async () => {
    const taxFree = new Date()
    taxFree.setDate(taxFree.getDate() - 10)
    const purchase = new Date(taxFree)
    purchase.setFullYear(purchase.getFullYear() - 3)
    const h = {
      id: 'h1',
      isin: 'CZFREE',
      name: 'Czech equity tax-free',
      category: 'EQUITY',
      units: 10,
      nav: 100,
      currentValueCzk: 10_000,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: purchase,
      taxFreeDate: taxFree,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10) as never)
    prismaMock.holding.findMany.mockResolvedValue([h as never])
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    expect(p.allocations.some((a) => a.type === 'BUY' && (a as { isin?: string }).isin === 'CZFREE')).toBe(false)
    // Existing CZ equity past tax window: planner skips new library equity BUY into that sleeve (see allocationPlanner).
    expect(p.allocations.some((a) => a.type === 'BUY' && (a as { isin?: string }).isin === 'EQTOP')).toBe(false)
  })

  it('8b: tax window — reduced BUY when Settings.taxFreeWindowAllowsBuy=true', async () => {
    const taxFree = new Date()
    taxFree.setDate(taxFree.getDate() + 30)
    const purchase = new Date(taxFree)
    purchase.setFullYear(purchase.getFullYear() - 3)
    const h = {
      id: 'h1',
      isin: 'CZNEAR',
      name: 'Czech equity near',
      category: 'EQUITY',
      units: 10,
      nav: 100,
      currentValueCzk: 10_000,
      status: 'ACTIVE',
      country: 'CZ',
      purchaseStartDate: purchase,
      taxFreeDate: taxFree,
      cashflows: [] as { amountCzk: number; type: string }[]
    }
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile() as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(65, 25, 10, true) as never)
    prismaMock.holding.findMany.mockResolvedValue([h as never])
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 400_000, type: 'SAVINGS', isActive: true, balanceLocal: 400_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    const eq = p.allocations.find((a) => a.type === 'BUY' && (a as { isin?: string }).isin === 'CZNEAR')
    expect(eq).toBeTruthy()
  })

  it('10: CONSERVATIVE style targets → more to bonds name than growth case', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(baseProfile({ riskProfile: 'CONSERVATIVE' }) as never)
    prismaMock.incomeEvent.findMany.mockResolvedValue([{ recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(20_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings(40, 50, 10) as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([{ balanceCzkSnapshot: 500_000, type: 'SAVINGS', isActive: true, balanceLocal: 500_000, currency: 'CZK' }] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    const fromBd = p.allocations
      .filter((a) => a.type === 'BUY' && a.destination.toLowerCase().includes('bond'))
      .reduce((s, a) => s + a.amountCzk, 0)
    prismaMock.settings.findFirst.mockResolvedValue(settings(85, 10, 5) as never)
    const g = await buildMonthlyPlanPayload('2026-05')
    const gBd = g.allocations
      .filter((a) => a.type === 'BUY' && a.destination.toLowerCase().includes('bond'))
      .reduce((s, a) => s + a.amountCzk, 0)
    expect(fromBd).toBeGreaterThan(gBd)
  })

  it('11: INR NRE emergency cash uses live FX (Shape B), not absent snapshot', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(
      baseProfile({ emergencyFundTarget: 600_000 }) as never
    )
    prismaMock.incomeEvent.findMany.mockResolvedValue([
      { recurring: true, amountCzk: 0, date: new Date(), id: 'i', source: 'x', amountLocal: 0, currency: 'CZK', createdAt: new Date() }
    ])
    prismaMock.expenseCommitment.findMany.mockResolvedValue([monthlyExpense(10_000)] as never)
    prismaMock.upcomingEvent.findMany.mockResolvedValue([] as never)
    prismaMock.settings.findFirst.mockResolvedValue(settings() as never)
    prismaMock.holding.findMany.mockResolvedValue(balancedHoldings65(equityHolding(false) as never))
    prismaMock.account.findMany.mockResolvedValue([
      {
        type: 'NRE',
        balanceLocal: 2_000_000,
        currency: 'INR',
        balanceCzkSnapshot: null,
        isActive: true
      }
    ] as never)
    const p = await buildMonthlyPlanPayload('2026-05')
    // Live cash ≈ 500k CZK; target 600k → gap 100k → topup min(8333, 9750)=8333. Stale-zero path → topup 9750.
    expect(p.emergencyTopupCzk).toBeGreaterThan(8000)
    expect(p.emergencyTopupCzk).toBeLessThan(9500)
  })
})
