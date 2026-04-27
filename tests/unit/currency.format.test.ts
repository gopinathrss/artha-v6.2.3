import { formatCurrency } from '../../src/lib/currency'

describe('formatCurrency', () => {
  it('formats CZK with space thousands', () => {
    expect(formatCurrency(1234567, 'CZK')).toMatch(/1\s*234\s*567/)
    expect(formatCurrency(1234567, 'CZK')).toContain('Kč')
  })
  it('formats EUR', () => {
    const s = formatCurrency(1000, 'EUR')
    expect(s).toMatch(/€|EUR/)
  })
})
