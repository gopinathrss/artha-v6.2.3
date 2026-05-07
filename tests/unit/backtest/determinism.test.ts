import { describe, expect, it } from 'vitest'
import { hasTestDatabase } from '../../api/helpers'
import { runBacktest } from '../../../src/lib/backtest/engine'

const run = hasTestDatabase()

describe.skipIf(!run)('backtest determinism (F12.2)', () => {
  it('identical config yields identical cagr and finalValueCzk', async () => {
    const cfg = {
      strategy: 'ALL_EQUITY_VWCE' as const,
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-12-31'),
      initialValueCzk: 100_000,
      monthlySipCzk: 5000
    }
    const a = await runBacktest(cfg)
    const b = await runBacktest(cfg)
    expect(a.cagr).toBe(b.cagr)
    expect(a.finalValueCzk).toBe(b.finalValueCzk)
  })

  it('different SIP changes result', async () => {
    const base = {
      strategy: 'ALL_EQUITY_VWCE' as const,
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-12-31'),
      initialValueCzk: 100_000
    }
    const r1 = await runBacktest({ ...base, monthlySipCzk: 5000 })
    const r2 = await runBacktest({ ...base, monthlySipCzk: 10_000 })
    expect(r1.finalValueCzk).not.toBe(r2.finalValueCzk)
  })
})
