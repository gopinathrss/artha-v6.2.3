import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  convertCurrency,
  ensureFreshRatesIfStale,
  formatCurrency,
  getFxAgeHours,
  getRateAge,
  needsFetchWithin
} from '../../src/lib/currency'

const findFirst = vi.fn()

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    fXRate: {
      findFirst: (...a: unknown[]) => findFirst(...a)
    }
  }
}))

const fresh = (ccy: 'EUR' | 'USD' | 'INR', rate: number) => ({
  id: 'x',
  base: 'CZK' as const,
  quote: ccy,
  rate,
  source: 'TEST',
  stale: false,
  fetchedAt: new Date(),
  createdAt: new Date()
})

beforeEach(() => {
  findFirst.mockReset()
  findFirst.mockImplementation(async (args: { where?: { quote?: string } }) => {
    const q = args?.where?.quote
    if (q === 'EUR') return fresh('EUR', 25)
    if (q === 'USD') return fresh('USD', 23)
    if (q === 'INR') return fresh('INR', 0.28)
    return null
  })
})

describe('formatCurrency', () => {
  it('formats CZK with space thousands', () => {
    expect(formatCurrency(1234567, 'CZK')).toMatch(/1\s*234\s*567/)
    expect(formatCurrency(1234567, 'CZK')).toContain('Kč')
  })
  it('formats INR (lakh / Indian grouping via en-IN)', () => {
    const s = formatCurrency(1234567, 'INR')
    expect(s).toContain('₹')
  })
  it('formats EUR and USD', () => {
    expect(formatCurrency(1000, 'EUR')).toMatch(/€|EUR/)
    expect(formatCurrency(1000, 'USD')).toMatch(/\$|USD/)
  })
  it('unknown currency falls back to fixed + code', () => {
    expect(formatCurrency(12.3, 'GBP')).toMatch(/12\.30/)
    expect(formatCurrency(12.3, 'GBP')).toContain('GBP')
  })
})

describe('convertCurrency', () => {
  it('converts CZK↔EUR and CZK↔USD and CZK↔INR', async () => {
    expect(await convertCurrency(1000, 'CZK', 'CZK')).toBe(1000)
    const eur = await convertCurrency(25000, 'CZK', 'EUR')
    expect(eur).toBeCloseTo(1000, 2)
    const czk = await convertCurrency(1000, 'EUR', 'CZK')
    expect(czk).toBeCloseTo(25000, 2)
    const usd = await convertCurrency(23000, 'CZK', 'USD')
    expect(usd).toBeCloseTo(1000, 2)
    const czk2 = await convertCurrency(1000, 'USD', 'CZK')
    expect(czk2).toBeCloseTo(23000, 2)
    const inr = await convertCurrency(1000, 'CZK', 'INR')
    expect(inr).toBeGreaterThan(1000)
  })

  it('throws if FX is older than 7 days', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    findFirst.mockImplementation(async (args: { where?: { quote?: string } }) => {
      const q = args?.where?.quote
      if (q === 'EUR')
        return {
          ...fresh('EUR', 25),
          fetchedAt: old
        }
      if (q === 'USD') return { ...fresh('USD', 23), fetchedAt: old }
      if (q === 'INR') return { ...fresh('INR', 0.28), fetchedAt: old }
      return null
    })
    await expect(convertCurrency(100, 'CZK', 'EUR')).rejects.toThrow(/168h/i)
  })
})

describe('needsFetchWithin & ensureFreshRatesIfStale', () => {
  it('needs fetch when no row', async () => {
    findFirst.mockResolvedValue(null)
    await expect(needsFetchWithin(24)).resolves.toBe(true)
  })
  it('returns cached triplet when fresh', async () => {
    const now = new Date()
    findFirst.mockImplementation(async (args: { where?: { quote?: string } }) => {
      const q = args?.where?.quote
      if (q === 'EUR' || q === 'USD' || q === 'INR') return { ...fresh(q as 'EUR', 25), fetchedAt: now }
      return null
    })
    const c = await ensureFreshRatesIfStale(0.001) // very small hours → still "fresh" if findFirst returns now
    expect(c).not.toBeNull()
    expect(c!.source).toBe('CACHED')
  })
})

describe('getFxAgeHours', () => {
  it('returns stalest leg age in hours across EUR/USD/INR', async () => {
    const now = Date.now()
    findFirst.mockImplementation(async (args: { where?: { quote?: string } }) => {
      const q = args?.where?.quote
      const t = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000)
      if (q === 'EUR') return { ...fresh('EUR', 25), fetchedAt: t(10) }
      if (q === 'USD') return { ...fresh('USD', 23), fetchedAt: t(5) }
      if (q === 'INR') return { ...fresh('INR', 0.28), fetchedAt: t(30) }
      return null
    })
    const h = await getFxAgeHours()
    expect(h).toBeCloseTo(30, 5)
  })
})

describe('getRateAge', () => {
  it('returns minutes for freshest/stalest across EUR/USD/INR', async () => {
    const now = Date.now()
    findFirst.mockImplementation(async (args: { where?: { quote?: string } }) => {
      const q = args?.where?.quote
      const t = (minAgo: number) => new Date(now - minAgo * 60_000)
      if (q === 'EUR') return { ...fresh('EUR', 25), fetchedAt: t(10) }
      if (q === 'USD') return { ...fresh('USD', 23), fetchedAt: t(20) }
      if (q === 'INR') return { ...fresh('INR', 0.28), fetchedAt: t(30) }
      return null
    })
    const a = await getRateAge()
    expect(a.freshest).toBe(10)
    expect(a.stalest).toBe(30)
  })
})
