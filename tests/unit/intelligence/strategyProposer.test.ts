import { describe, expect, it } from 'vitest'
import { proposeStrategy } from '../../../src/lib/intelligence/strategyProposer'
import type { StrategyInput } from '../../../src/lib/intelligence/types'

function baseInput(overrides: Partial<StrategyInput> = {}): StrategyInput {
  const input: StrategyInput = {
    holding: {
      id: 'h1',
      isin: 'IE00B3XXRP09',
      name: 'Vanguard S&P 500',
      category: 'EQUITY',
      currentValueCzk: 0,
      costBasisCzk: 0,
      monthlySipCzk: 0,
      purchaseStartDate: new Date('2022-01-01T00:00:00.000Z'),
      taxFreeDate: null,
      status: 'ACTIVE'
    },
    backtestStats: {
      cagrPct5yr: 11.9,
      maxDrawdownPct: 23.5,
      sharpeRatio: 1.5,
      recoveryMonths: 8
    },
    libraryScore: {
      score: 88,
      terPct: 0.07,
      fundSizeM: 5000,
      availableInGeorge: true
    },
    profile: {
      riskProfile: 'Moderate',
      targetEquityPct: 60,
      targetBondsPct: 30,
      targetCashPct: 10,
      monthlyInvestable: 52000,
      retirementAge: 50,
      currentAge: 32
    },
    currentAllocation: {
      equityPct: 2.2,
      bondsPct: 50,
      cashPct: 47.8,
      totalCzk: 860_833
    }
  }
  return { ...input, ...overrides } as StrategyInput
}

describe('strategyProposer', () => {
  it('HIGH confidence path: uses backtest + library', () => {
    const out = proposeStrategy(baseInput())
    expect(out.confidence).toBe('HIGH')
    expect(out.allocationSleeve).toBe('equity')
    expect(out.monthlySipCzk).toBeGreaterThan(0)
    expect(out.monthlySipCzk % 500).toBe(0)
    expect(out.absoluteCapCzk).toBeGreaterThan(0)
    expect(out.profitCapPct).toBeGreaterThan(35)
    expect(out.profitCapCzk).toBeGreaterThan(out.absoluteCapCzk)
    expect(out.proposalReasoning).toContain('CAGR 11.9')
    expect(String(out.keyMetrics.riskProfile)).toMatch(/moderate/i)
    expect(out.keyMetrics.cagrPct5yr).toBe(11.9)
  })

  it('LOW confidence path: missing backtest stats', () => {
    const out = proposeStrategy(baseInput({ backtestStats: null }))
    expect(out.confidence).toBe('MEDIUM') // library still present
    expect(out.proposalReasoning).toContain('No backtest history')
    expect(out.profitCapPct).toBe(35)
    expect(out.drawdownGuardrailPct).toBe(20)
  })

  it('LOW confidence path: missing backtest and library', () => {
    const out = proposeStrategy(baseInput({ backtestStats: null, libraryScore: null }))
    expect(out.confidence).toBe('LOW')
    expect(out.allocationPct).toBe(30)
  })

  it('Conservative profile uses lower drawdown + lower profit cap', () => {
    const out = proposeStrategy(baseInput({ profile: { ...baseInput().profile, riskProfile: 'Conservative' } }))
    expect(out.drawdownGuardrailPct).toBe(15)
    expect(out.profitCapPct).toBeLessThan(35)
  })

  it('Aggressive profile uses higher drawdown and profit cap bonus', () => {
    const out = proposeStrategy(
      baseInput({
        profile: { ...baseInput().profile, riskProfile: 'Aggressive' },
        backtestStats: { ...baseInput().backtestStats!, cagrPct5yr: 15 }
      })
    )
    expect(out.drawdownGuardrailPct).toBe(30)
    expect(out.profitCapPct).toBeGreaterThan(50)
  })

  it('Tax-free preference respects horizon', () => {
    const near = new Date()
    near.setMonth(near.getMonth() + 6)
    const outNear = proposeStrategy(baseInput({ holding: { ...baseInput().holding, taxFreeDate: near } }))
    expect(outNear.preferTaxFreeExit).toBe(true)

    const far = new Date()
    far.setMonth(far.getMonth() + 48)
    const outFar = proposeStrategy(baseInput({ holding: { ...baseInput().holding, taxFreeDate: far } }))
    expect(outFar.preferTaxFreeExit).toBe(false)
  })

  it('Months to target uses ceiling', () => {
    const input = baseInput()
    input.holding.currentValueCzk = 50_000
    input.profile.monthlyInvestable = 50_000
    const out = proposeStrategy(input)
    // We just verify it is a positive integer; exact depends on derived cap/SIP.
    expect(out.monthsToTarget).toBeGreaterThan(0)
    expect(Number.isInteger(out.monthsToTarget)).toBe(true)
  })

  it('Case G — truncated NAV history: suppresses CAGR in reasoning, MEDIUM confidence', () => {
    const out = proposeStrategy(
      baseInput({
        backtestStats: {
          cagrPct5yr: null,
          maxDrawdownPct: 7.8,
          sharpeRatio: null,
          recoveryMonths: 6,
          dataPointCount: 6,
          isTruncated: true
        }
      })
    )
    expect(out.confidence).toBe('MEDIUM')
    expect(out.proposalReasoning).toMatch(/Limited price history/)
    expect(out.proposalReasoning).not.toMatch(/CAGR -0\.2/)
    expect(out.keyMetrics.cagrPct5yr).toBeNull()
  })

  it('Case H — adequate data points: HIGH confidence with library + full backtest', () => {
    const out = proposeStrategy(
      baseInput({
        backtestStats: {
          cagrPct5yr: 11.9,
          maxDrawdownPct: 23.5,
          sharpeRatio: 1.5,
          recoveryMonths: 8,
          dataPointCount: 30,
          isTruncated: false
        }
      })
    )
    expect(out.confidence).toBe('HIGH')
    expect(out.proposalReasoning).toContain('CAGR 11.9')
  })
})

