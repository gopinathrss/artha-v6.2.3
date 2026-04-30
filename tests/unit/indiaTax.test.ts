import { describe, expect, it } from 'vitest'
import { calculateTaxStatus } from '../../src/lib/calculations'
import { equityLtcgTaxInr, indiaMfTaxBadge } from '../../src/lib/indiaTax'

describe('indiaMfTaxBadge', () => {
  it('LTCG eligible after 365d equity', () => {
    const p = new Date('2020-01-01')
    const b = indiaMfTaxBadge({ category: 'EQUITY', purchaseDate: p, now: new Date('2022-01-10') })
    expect(b.tone).toBe('green')
    expect(b.label).toMatch(/LTCG/i)
  })
  it('STCG when held < 365d', () => {
    const p = new Date('2025-12-01')
    const b = indiaMfTaxBadge({ category: 'EQUITY', purchaseDate: p, now: new Date('2026-01-01') })
    expect(b.tone).toBe('amber')
  })
  it('slab for debt', () => {
    const b = indiaMfTaxBadge({ category: 'DEBT', purchaseDate: new Date('2024-05-01') })
    expect(b.label).toMatch(/slab/i)
  })
  it('ELSS lock 3y', () => {
    const b = indiaMfTaxBadge({ category: 'ELSS', purchaseDate: new Date('2025-01-01'), now: new Date('2026-01-01') })
    expect(b.tone).toBe('red')
  })
})

describe('equityLtcgTaxInr (1.25L exemption, 12.5%)', () => {
  it('5L gain → 46,875 INR', () => {
    const g = 5 * 100_000
    expect(equityLtcgTaxInr(g)).toBe(46_875)
  })
  it('exemption only', () => {
    expect(equityLtcgTaxInr(100_000)).toBe(0)
  })
})

describe('days to CZ tax-free (3y) on holding', () => {
  it('counts down days until taxFreeDate', () => {
    const taxFree = new Date()
    taxFree.setDate(taxFree.getDate() + 100)
    const h = { taxFreeDate: taxFree, purchaseStartDate: new Date() }
    const t = calculateTaxStatus(h, new Date())
    expect(t.daysUntilTaxFree).toBeGreaterThan(90)
    expect(t.isTaxFree).toBe(false)
  })
})
