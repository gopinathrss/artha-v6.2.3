import {
  calculateXIRR,
  calculateNetWorth,
  calculateAllocation
} from '../../src/lib/calculations'

describe('XIRR', () => {
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
    const total = r.czechFundsCzk + r.indiaNRECzk
    expect(r.gainCzk).toBeCloseTo(total - totalInvested, 1)
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
})
