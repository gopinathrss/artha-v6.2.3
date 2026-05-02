import { describe, expect, it } from 'vitest'
import {
  calculateAllocation,
  indiaAccountSlicesFromAccounts,
  indiaMfAllocationPieces
} from '../../src/lib/calculations'
import { accountsToCzk } from '../../src/lib/accountToCzk'

/** Mirrors /api/overview allocation denominator: holdings + India MF + India INR accounts (F2.2). */
describe('overview allocation math', () => {
  it('allocation.cashCzk matches INR cash-like accounts in CZK', () => {
    const fx = { EURCZK: 25, EURINR: 100 }
    const holdings = [
      { status: 'ACTIVE', category: 'EQUITY', currentValueCzk: 20_000 },
      { status: 'ACTIVE', category: 'BONDS', currentValueCzk: 10_000 }
    ]
    const accounts = [
      { type: 'NRE', currency: 'INR', balanceLocal: 2_000_000, isActive: true },
      { type: 'SAVINGS', currency: 'INR', balanceLocal: 500_000, isActive: true }
    ]
    const fundSlices = indiaMfAllocationPieces([], fx)
    const acctSlices = indiaAccountSlicesFromAccounts(accounts, fx)
    const a = calculateAllocation(holdings, 60, 30, 10, fundSlices, acctSlices)
    const cashAccounts = accounts.filter((x) => ['NRE', 'NRO', 'SAVINGS'].includes(String(x.type)))
    const expectedCash = accountsToCzk(cashAccounts, fx).toNumber()
    expect(a.cashCzk).toBeCloseTo(expectedCash, 4)
    expect(a.equityCzk + a.bondsCzk + a.cashCzk).toBeCloseTo(30_000 + expectedCash, 4)
  })
})
