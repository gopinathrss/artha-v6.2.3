import {
  calculateXIRR,
  calculateNetWorth,
  calculateAllocation,
  projectFutureValue,
  calculateRequiredSIP,
  calculateHealth,
  calculateConfidence,
  calculateTaxStatus,
  indiaAccountSlicesFromAccounts
} from '../../src/lib/calculations'

describe('XIRR', () => {
  test('no data — zero flows', () => {
    const r = calculateXIRR([], new Date('2024-01-01'), 0)
    expect(r.cashflowCount).toBe(0)
  })
  test('Benchmark 1: profitable short history (annualized estimate path)', () => {
    const cashflows = [
      { date: new Date('2024-01-01'), amount: -4550 },
      { date: new Date('2024-02-01'), amount: -4550 },
      { date: new Date('2024-03-01'), amount: -4550 },
      { date: new Date('2024-04-01'), amount: -4550 },
      { date: new Date('2024-05-01'), amount: -4550 }
    ]
    const r = calculateXIRR(cashflows, new Date('2024-06-01'), 27803)
    expect(r.isEstimate).toBe(true)
    expect(r.value).not.toBeNull()
    expect(r.value!).toBeGreaterThanOrEqual(40)
    expect(r.value!).toBeLessThanOrEqual(80)
  })

  test('Benchmark 2: long history convergent', () => {
    const cashflows = [
      { date: new Date('2022-01-01'), amount: -100000 },
      { date: new Date('2022-07-01'), amount: -50000 },
      { date: new Date('2023-01-01'), amount: -50000 },
      { date: new Date('2023-07-01'), amount: -50000 }
    ]
    const r = calculateXIRR(cashflows, new Date('2024-01-01'), 310000)
    expect(r.isEstimate).toBe(false)
    expect(r.value).not.toBeNull()
    // Excel-style XIRR for these irregular dates lands ~16.2–18.5% depending on day-count; keep a tight band.
    expect(r.value!).toBeGreaterThanOrEqual(16)
    expect(r.value!).toBeLessThanOrEqual(20)
  })

  test('Benchmark 3: losing portfolio — negative XIRR, finite', () => {
    const cashflows = [
      { date: new Date('2023-01-01'), amount: -100000 },
      { date: new Date('2023-06-01'), amount: -50000 }
    ]
    const r = calculateXIRR(cashflows, new Date('2024-01-01'), 120000)
    expect(r.value).not.toBeNull()
    expect(Number.isFinite(r.value!)).toBe(true)
    expect(r.value!).toBeLessThan(0)
  })
})

describe('calculateNetWorth', () => {
  test('known FX and totals', () => {
    const holdings = [{ currentValueCzk: 6234.74 }, { currentValueCzk: 4163.15 }]
    const accounts = [{ type: 'NRE', balanceLocal: 3000000, currency: 'INR' }]
    const fxRates = { EURCZK: 24.5, EURINR: 89.5 }
    const totalInvested = 22750
    const r = calculateNetWorth(holdings, accounts, totalInvested, fxRates)
    expect(r.czechFundsCzk).toBeCloseTo(10397.89, 1)
    expect(r.indiaNRECzk).toBeGreaterThan(821229 - 5)
    expect(r.indiaNRECzk).toBeLessThan(821229 + 5)
    expect(r.indiaMfCzk).toBe(0)
    expect(r.indiaCzk).toBeCloseTo(r.indiaNRECzk, 1)
    expect(r.indiaCzk).toBeCloseTo(r.indiaTotal, 1)
    expect(r.indiaCzk).not.toBeCloseTo(r.indiaMfCzk, 1)
    const total = r.czechFundsCzk + r.indiaNRECzk
    expect(r.gainCzk).toBeCloseTo(total - totalInvested, 1)
    expect(r.totalCzk).toBeCloseTo(r.czechTotal + r.indiaTotal, 1)
  })

  test('India MF INR rolls into totalCzk and indiaTotal', () => {
    const fxRates = { EURCZK: 25, EURINR: 100 }
    const mfs = [{ units: 1000, currentNavInr: 110, avgNavInr: 100, category: 'EQUITY_LARGE' }]
    const r = calculateNetWorth([], [], 0, fxRates, mfs)
    const expectedMf = 110_000 * (25 / 100)
    expect(r.indiaMfCzk).toBeCloseTo(expectedMf, 4)
    expect(r.totalCzk).toBeCloseTo(expectedMf, 4)
    expect(r.indiaTotal).toBeCloseTo(expectedMf, 4)
    expect(r.indiaCzk).toBeCloseTo(expectedMf, 4)
    expect(r.indiaCzk).toBeCloseTo(r.indiaMfCzk, 4)
    expect(r.indiaCzk).toBeCloseTo(r.indiaTotal, 4)
    expect(r.totalCzk).toBeCloseTo(r.czechTotal + r.indiaTotal, 4)
  })

  test('indiaCzk is full India aggregate: NRE + MF vs indiaMfCzk MF-only', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const nreCzk = 100_000 * (25 / 100)
    const mfCzk = 1000 * 110 * (25 / 100)
    const accounts = [{ type: 'NRE', balanceLocal: 100_000, currency: 'INR', isActive: true }]
    const mfs = [{ units: 1000, currentNavInr: 110, avgNavInr: 100, category: 'EQUITY_LARGE' }]
    const r = calculateNetWorth([], accounts, 0, fx, mfs)
    expect(r.indiaMfCzk).toBeCloseTo(mfCzk, 4)
    expect(r.indiaNRECzk).toBeCloseTo(nreCzk, 4)
    expect(r.indiaTotal).toBeCloseTo(nreCzk + mfCzk, 4)
    expect(r.indiaCzk).toBeCloseTo(r.indiaTotal, 4)
    expect(r.indiaCzk).not.toBeCloseTo(r.indiaMfCzk, 2)
    expect(r.totalCzk).toBeCloseTo(r.czechTotal + r.indiaTotal, 4)
  })
})

describe('projectFutureValue & calculateRequiredSIP', () => {
  test('FV with zero rate uses linear', () => {
    expect(projectFutureValue(100_000, 0, 5, 1000)).toBeGreaterThan(100_000)
  })
  test('required SIP positive toward goal', () => {
    expect(calculateRequiredSIP(0, 1_000_000, 8, 10)).toBeGreaterThan(0)
  })
})

describe('calculateHealth & confidence', () => {
  test('returns graded health', () => {
    const h = calculateHealth([], [], [], 12)
    expect(h.score).toBeGreaterThanOrEqual(0)
    expect(h.score).toBeLessThanOrEqual(100)
    expect(['A', 'B', 'C', 'D']).toContain(h.grade)
  })
  test('confidence penalizes stale FX', () => {
    const a = calculateConfidence(10, 10, 0, 12)
    const b = calculateConfidence(10, 100, 0, 12)
    expect(b).toBeLessThanOrEqual(a)
  })
})

describe('calculateTaxStatus', () => {
  test('isTaxFree when past date', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const t = calculateTaxStatus({ taxFreeDate: d }, new Date())
    expect(t.isTaxFree).toBe(true)
  })
})

describe('calculateAllocation', () => {
  test('50 random portfolios sum to 100%', () => {
    for (let i = 0; i < 50; i++) {
      const n = 3 + Math.floor(Math.random() * 6)
      const holdings = []
      for (let j = 0; j < n; j++) {
        holdings.push({
          status: 'ACTIVE',
          category: ['EQUITY', 'BONDS', 'CASH', 'MIXED', 'COMMODITY'][j % 5],
          currentValueCzk: Math.random() * 1_000_000
        })
      }
      const a = calculateAllocation(holdings, 65, 25, 10)
      const sum = a.equityPct + a.bondsPct + a.cashPct
      expect(sum).toBeGreaterThanOrEqual(99.99)
      expect(sum).toBeLessThanOrEqual(100.01)
    }
  })

  test('India account slices material (B)', () => {
    const holdings = [{ status: 'ACTIVE', category: 'EQUITY', currentValueCzk: 20_000 }]
    const a = calculateAllocation(holdings, 60, 30, 10, null, { bondsCzk: 100_000, cashCzk: 400_000 })
    expect(a.equityCzk).toBeCloseTo(20_000, 4)
    expect(a.bondsCzk).toBeCloseTo(100_000, 4)
    expect(a.cashCzk).toBeCloseTo(400_000, 4)
    const tot = a.equityCzk + a.bondsCzk + a.cashCzk
    expect(tot).toBeCloseTo(520_000, 4)
    expect(a.equityPct).toBeCloseTo((100 * 20_000) / 520_000, 4)
    expect(a.bondsPct).toBeCloseTo((100 * 100_000) / 520_000, 4)
    expect(a.cashPct).toBeCloseTo((100 * 400_000) / 520_000, 4)
  })

  test('Fund slices plus account slices (C)', () => {
    const holdings = [{ status: 'ACTIVE', category: 'EQUITY', currentValueCzk: 20_000 }]
    const a = calculateAllocation(holdings, 60, 30, 10, { equityCzk: 50_000, bondsCzk: 0, cashCzk: 0 }, {
      bondsCzk: 100_000,
      cashCzk: 200_000
    })
    expect(a.equityCzk).toBeCloseTo(70_000, 4)
    expect(a.bondsCzk).toBeCloseTo(100_000, 4)
    expect(a.cashCzk).toBeCloseTo(200_000, 4)
    expect(a.equityCzk + a.bondsCzk + a.cashCzk).toBeCloseTo(370_000, 4)
  })

  test('omitting indiaAccountSlices matches explicit null (D)', () => {
    const holdings = [{ status: 'ACTIVE', category: 'EQUITY', currentValueCzk: 10_000 }]
    const a1 = calculateAllocation(holdings, 60, 30, 10)
    const a2 = calculateAllocation(holdings, 60, 30, 10, null, null)
    expect(a1).toEqual(a2)
  })
})

describe('indiaAccountSlicesFromAccounts', () => {
  test('classifies INR FD as bonds and NRE/NRO/SAVINGS as cash', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const accounts = [
      { type: 'FIXED_DEPOSIT', currency: 'INR', balanceLocal: 400_000, isActive: true },
      { type: 'NRE', currency: 'INR', balanceLocal: 2_000_000, isActive: true },
      { type: 'NRO', currency: 'INR', balanceLocal: 1_000_000, isActive: true },
      { type: 'SAVINGS', currency: 'INR', balanceLocal: 500_000, isActive: true }
    ]
    const s = indiaAccountSlicesFromAccounts(accounts, fx)
    expect(s.bondsCzk).toBeCloseTo(100_000, 4)
    expect(s.cashCzk).toBeCloseTo(500_000 + 250_000 + 125_000, 4)
  })
})

