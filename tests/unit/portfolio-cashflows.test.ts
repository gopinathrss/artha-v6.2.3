import { describe, expect, it } from 'vitest'
import { netCashInvestedCzkFromCashflows } from '../../src/lib/portfolio'

describe('netCashInvestedCzkFromCashflows', () => {
  it('sums SIP and LUMP_SUM by magnitude (either sign)', () => {
    expect(
      netCashInvestedCzkFromCashflows([
        { holdingId: 'a', date: '2024-01-05', type: 'SIP', amountCzk: -2000 },
        { holdingId: 'a', date: '2024-02-05', type: 'SIP', amountCzk: 1500 },
        { holdingId: 'b', date: '2024-03-01', type: 'LUMP_SUM', amountCzk: -10_000 }
      ])
    ).toBe(13_500)
  })

  it('subtracts WITHDRAWAL magnitude', () => {
    expect(
      netCashInvestedCzkFromCashflows([
        { holdingId: 'a', date: '2024-01-01', type: 'SIP', amountCzk: -5000 },
        { holdingId: 'a', date: '2024-06-01', type: 'WITHDRAWAL', amountCzk: -8000 },
        { holdingId: 'a', date: '2024-07-01', type: 'WITHDRAWAL', amountCzk: 3000 }
      ])
    ).toBe(5000 - 8000 - 3000)
  })

  it('ignores DIVIDEND for principal-style invested total', () => {
    expect(
      netCashInvestedCzkFromCashflows([
        { holdingId: 'a', date: '2024-01-01', type: 'SIP', amountCzk: -1000 },
        { holdingId: 'a', date: '2024-02-01', type: 'DIVIDEND', amountCzk: 200 }
      ])
    ).toBe(1000)
  })

  it('counts duplicate identical rows once (re-import / double-create)', () => {
    expect(
      netCashInvestedCzkFromCashflows([
        { holdingId: 'h1', date: '2024-05-10T12:00:00.000Z', type: 'SIP', amountCzk: -2500 },
        { holdingId: 'h1', date: '2024-05-10T00:00:00.000Z', type: 'SIP', amountCzk: -2500 }
      ])
    ).toBe(2500)
  })
})
