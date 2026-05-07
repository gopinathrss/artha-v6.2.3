import { describe, expect, it } from 'vitest'
import { parseAllocationsJsonStrict, parsePlanAllocations } from '../../src/lib/allocationPlanSchema'

describe('allocationPlanSchema', () => {
  it('parses valid bare array of mixed rows', () => {
    const rows = [
      { type: 'BUY', amountCzk: 100, reason: 'x', destination: 'D', isin: 'IE1' },
      { type: 'SELL', amountCzk: 50, reason: 's', isin: 'IE2', source: 'src', sellSubtype: 'TAX_FREE_EXIT', taxImpactCzk: 1, currentValueCzk: 100 },
      { type: 'HOLD', amountCzk: 0, reason: 'h', isin: 'IE3', currentValueCzk: 200, holdReason: 'AT_TARGET' },
      { type: 'RESERVE', amountCzk: 10, reason: 'r', destination: 'Trip' }
    ]
    const out = parseAllocationsJsonStrict(rows)
    expect(out).toHaveLength(4)
  })

  it('parses wrapped { schemaVersion, rows }', () => {
    const rows = [{ type: 'BUY', amountCzk: -5, reason: 'neg buy ok for schema', destination: 'D' }]
    const out = parseAllocationsJsonStrict({ schemaVersion: 'v1', rows })
    expect(out).toHaveLength(1)
  })

  it('throws on unknown type', () => {
    expect(() => parseAllocationsJsonStrict([{ type: 'WITHDRAW', amountCzk: 1, reason: 'x' }])).toThrow()
  })

  it('throws on missing reason', () => {
    expect(() => parseAllocationsJsonStrict([{ type: 'BUY', amountCzk: 1 }])).toThrow()
  })

  it('SELL with taxImpactCzk null passes', () => {
    const rows = [
      {
        type: 'SELL',
        amountCzk: 1,
        reason: 'r',
        isin: 'X',
        source: 's',
        sellSubtype: 'REBALANCE_DRIFT',
        taxImpactCzk: null,
        currentValueCzk: 100
      }
    ]
    expect(() => parseAllocationsJsonStrict(rows)).not.toThrow()
  })

  it('empty array passes', () => {
    expect(parseAllocationsJsonStrict([])).toEqual([])
  })

  it('parsePlanAllocations falls back for legacy loose rows', () => {
    const legacy = [{ type: 'BUY', amountCzk: 1, reason: 'ok', destination: '', executionStatus: 'PENDING' }]
    const out = parsePlanAllocations(legacy)
    expect(out).toHaveLength(1)
  })
})
