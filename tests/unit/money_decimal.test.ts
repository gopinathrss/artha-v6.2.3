import { Prisma } from '@prisma/client'
import { d, num } from '../../src/lib/money'
import { calculateNetWorth } from '../../src/lib/calculations'

describe('money.ts + Decimal net worth', () => {
  test('d().plus avoids binary float dust on classic 0.1 + 0.2', () => {
    const sum = d('0.1').plus(d('0.2'))
    expect(sum.toString()).toBe('0.3')
    expect(num(sum)).toBeCloseTo(0.3, 15)
  })

  test('calculateNetWorth sums Decimal currentValueCzk exactly', () => {
    const holdings = [
      { status: 'ACTIVE', currentValueCzk: new Prisma.Decimal('6234.74') },
      { status: 'ACTIVE', currentValueCzk: new Prisma.Decimal('4163.15') }
    ]
    const r = calculateNetWorth(holdings, [], 0, { EURCZK: 25, EURINR: 100 }, [])
    expect(r.czechFundsCzk).toBeCloseTo(10397.89, 2)
    expect(new Prisma.Decimal(r.czechFundsCzk).toFixed(2)).toBe('10397.89')
  })

  test('India MF path with Decimal units and NAV', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const mfs = [
      {
        units: new Prisma.Decimal('1000'),
        currentNavInr: new Prisma.Decimal('110'),
        avgNavInr: new Prisma.Decimal('100'),
        category: 'EQUITY_LARGE'
      }
    ]
    const r = calculateNetWorth([], [], 0, fx, mfs)
    expect(r.indiaMfCzk).toBe(27500)
    expect(r.indiaCzk).toBe(27500)
    expect(r.totalCzk).toBe(27500)
  })
})
