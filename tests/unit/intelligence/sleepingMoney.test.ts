import { describe, expect, it, vi } from 'vitest'
import { AccountRole } from '@prisma/client'
import { computeCapitalEfficiency } from '../../../src/lib/intelligence/sleepingMoneyEngine'
import {
  accountContributesToDeployableAllocationSlice,
  indiaAccountSlicesFromAccounts
} from '../../../src/lib/calculations'

vi.mock('../../../src/lib/fetchers', () => ({
  getFXRates: vi.fn(async () => ({ EURCZK: 25, EURINR: 90, source: 'test', ageHours: 0 }))
}))

function makePrismaMock(accounts: unknown[], profile: { emergencyFundTarget?: unknown } | null) {
  return {
    macroData: { findUnique: vi.fn().mockResolvedValue(null) },
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      update: vi.fn().mockResolvedValue({})
    },
    userProfile: { findUnique: vi.fn().mockResolvedValue(profile) }
  }
}

describe('sleepingMoneyEngine', () => {
  it('A: CZ savings sleeping + NRE geo skipped without tiers', async () => {
    const tiers = [
      { upTo: 400_000, ratePct: 3 },
      { above: 400_000, ratePct: 0.01 }
    ]
    const prisma = makePrismaMock(
      [
        {
          id: 'cz1',
          name: 'CZ Savings',
          type: 'SAVINGS',
          currency: 'CZK',
          balanceLocal: 718_590,
          interestTiers: tiers,
          accountRole: AccountRole.LONG_TERM_RESERVE,
          emergencyFundTarget: 200_000,
          fxTrendNote: null,
          isActive: true
        },
        {
          id: 'nre1',
          name: 'NRE',
          type: 'NRE',
          currency: 'INR',
          balanceLocal: 2_000_000,
          interestTiers: null,
          accountRole: AccountRole.GEO_STRATEGIC,
          emergencyFundTarget: null,
          fxTrendNote: null,
          isActive: true
        }
      ],
      { emergencyFundTarget: 200_000 }
    ) as never

    const report = await computeCapitalEfficiency(prisma)
    const cz = report.accounts.find((a) => a.accountId === 'cz1')
    const nre = report.accounts.find((a) => a.accountId === 'nre1')
    expect(cz?.sleepingCzk).toBeCloseTo(318_590, 0)
    expect(nre?.sleepingCzk).toBe(0)
    expect(report.totalSleepingCzk).toBeCloseTo(318_590, 0)
    expect(report.alertLevel).toBe('CRITICAL')
    expect(report.summary).toMatch(/318/)
    expect(report.deployableIdeas.length).toBeGreaterThanOrEqual(2)
  })

  it('B: balance within cap → no sleeping', async () => {
    const tiers = [
      { upTo: 400_000, ratePct: 3 },
      { above: 400_000, ratePct: 0.01 }
    ]
    const prisma = makePrismaMock(
      [
        {
          id: 'cz1',
          name: 'CZ Savings',
          type: 'SAVINGS',
          currency: 'CZK',
          balanceLocal: 300_000,
          interestTiers: tiers,
          accountRole: AccountRole.LONG_TERM_RESERVE,
          emergencyFundTarget: null,
          fxTrendNote: null,
          isActive: true
        }
      ],
      { emergencyFundTarget: 200_000 }
    ) as never

    const report = await computeCapitalEfficiency(prisma)
    expect(report.totalSleepingCzk).toBe(0)
    expect(report.alertLevel).toBe('NONE')
  })
})

describe('allocation deployable slice (V6.2.2)', () => {
  it('C: only INVESTABLE INR cash counts toward india cash slice', () => {
    const fx = { EURCZK: 25, EURINR: 90 }
    const accounts = [
      {
        type: 'NRE',
        currency: 'INR',
        balanceLocal: 1_000_000,
        isActive: true,
        accountRole: AccountRole.GEO_STRATEGIC
      },
      {
        type: 'NRE',
        currency: 'INR',
        balanceLocal: 100_000,
        isActive: true,
        accountRole: AccountRole.INVESTABLE
      }
    ]
    const slice = indiaAccountSlicesFromAccounts(accounts, fx)
    expect(slice.cashCzk).toBeGreaterThan(0)
    const allGeo = accounts.map((a) => ({ ...a, accountRole: AccountRole.GEO_STRATEGIC }))
    const sliceGeo = indiaAccountSlicesFromAccounts(allGeo, fx)
    expect(sliceGeo.cashCzk).toBe(0)
  })

  it('accountContributesToDeployableAllocationSlice respects role', () => {
    expect(
      accountContributesToDeployableAllocationSlice({
        type: 'NRE',
        accountRole: AccountRole.LONG_TERM_RESERVE,
        isActive: true
      })
    ).toBe(false)
    expect(
      accountContributesToDeployableAllocationSlice({
        type: 'NRE',
        accountRole: AccountRole.INVESTABLE,
        isActive: true
      })
    ).toBe(true)
  })
})
