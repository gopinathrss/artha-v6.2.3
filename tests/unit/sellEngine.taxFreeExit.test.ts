import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  holding: { findMany: vi.fn() }
}))

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }))

import { detectTaxFreeExitOpportunities } from '../../src/lib/sellEngine/taxFreeExit'

function h(ageDays: number, over: Record<string, unknown> = {}) {
  const purchase = new Date()
  purchase.setDate(purchase.getDate() - ageDays)
  const taxFree = new Date(purchase)
  taxFree.setFullYear(taxFree.getFullYear() + 3)
  return {
    id: 'x',
    isin: 'CZ0008472263',
    name: 'Test',
    category: 'BONDS',
    units: 1,
    nav: 1,
    currentValueCzk: 2500,
    status: 'ACTIVE',
    country: 'CZ',
    purchaseStartDate: purchase,
    taxFreeDate: taxFree,
    cashflows: [{ amountCzk: -2000, type: 'LUMP_SUM' }],
    ...over
  }
}

describe('detectTaxFreeExitOpportunities', () => {
  beforeEach(() => {
    prismaMock.holding.findMany.mockReset()
  })

  it('emits TAX_FREE_EXIT when age >= 1095 days', async () => {
    prismaMock.holding.findMany.mockResolvedValue([h(1100)] as never)
    const rows = await detectTaxFreeExitOpportunities()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('SELL')
    expect(rows[0].sellSubtype).toBe('TAX_FREE_EXIT')
    expect(rows[0].taxImpactCzk).toBe(0)
    expect(rows[0].isin).toBe('CZ0008472263')
  })

  it('no row when younger than 1095 days', async () => {
    prismaMock.holding.findMany.mockResolvedValue([h(1090)] as never)
    const rows = await detectTaxFreeExitOpportunities()
    expect(rows).toHaveLength(0)
  })

  it('negative gain still emits tax-free exit row', async () => {
    prismaMock.holding.findMany.mockResolvedValue(
      [h(1200, { currentValueCzk: 500, cashflows: [{ amountCzk: -2000, type: 'LUMP_SUM' }] })] as never
    )
    const rows = await detectTaxFreeExitOpportunities()
    expect(rows).toHaveLength(1)
  })
})
