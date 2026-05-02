import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { accountToCzk, accountsToCzk } from '../../src/lib/accountToCzk'

describe('accountToCzk', () => {
  it('converts INR via EUR cross', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const d = accountToCzk({ balanceLocal: 2_000_000, currency: 'INR' }, fx)
    expect(d.eq(new Prisma.Decimal('500000'))).toBe(true)
  })

  it('CZK ignores FX table', () => {
    const fx = { EURCZK: 99, EURINR: 1 }
    const d = accountToCzk({ balanceLocal: 100_000, currency: 'CZK' }, fx)
    expect(d.eq(new Prisma.Decimal('100000'))).toBe(true)
  })

  it('throws when EURINR not positive for INR', () => {
    expect(() =>
      accountToCzk({ balanceLocal: 100, currency: 'INR' }, { EURCZK: 25, EURINR: 0 })
    ).toThrow(/EURINR/)
  })

  it('sums mixed INR and CZK accounts', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const total = accountsToCzk(
      [
        { balanceLocal: 100_000, currency: 'CZK' },
        { balanceLocal: 2_000_000, currency: 'INR' },
        { balanceLocal: 1_000_000, currency: 'INR', type: 'NRO' }
      ] as never,
      fx
    )
    expect(total.eq(new Prisma.Decimal('850000'))).toBe(true)
  })
})
