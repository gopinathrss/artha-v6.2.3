import { Prisma } from '@prisma/client'
import { d, type MoneyInput } from './money'

/** FX inputs used for EUR and INR→CZK (via EUR cross). */
export type FxSnapshot = { EURCZK: MoneyInput; EURINR: MoneyInput }

export type AccountForCzk = {
  balanceLocal: MoneyInput
  currency: string
}

export function accountToCzk(account: AccountForCzk, fx: FxSnapshot): Prisma.Decimal {
  const cur = (account.currency || 'CZK').toUpperCase().trim()
  const local = d(account.balanceLocal)
  if (cur === 'CZK') return local
  if (cur === 'EUR') return local.mul(d(fx.EURCZK))
  if (cur === 'INR') {
    const einr = d(fx.EURINR)
    if (!einr.gt(0)) {
      throw new Error('accountToCzk: EURINR must be positive for INR conversion')
    }
    return local.mul(d(fx.EURCZK)).div(einr)
  }
  return local
}

export function accountsToCzk(accounts: AccountForCzk[], fx: FxSnapshot): Prisma.Decimal {
  return (accounts || []).reduce((sum, a) => sum.plus(accountToCzk(a, fx)), new Prisma.Decimal(0))
}
