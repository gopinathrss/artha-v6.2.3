import { realPrisma } from '../prisma'
import { d } from '../money'
import { assembleStrategyInput } from './assembleStrategyInput'
import { proposeStrategy } from './strategyProposer'

function dec2(n: number) {
  return d(Math.round((Number(n) || 0) * 100) / 100)
}

export async function createStrategyProposal(holdingId: string) {
  const input = await assembleStrategyInput(holdingId, realPrisma)
  const proposal = proposeStrategy(input)

  return realPrisma.fundStrategy.upsert({
    where: { holdingId: proposal.holdingId },
    update: {
      status: 'PROPOSED',
      confidence: proposal.confidence,
      proposedAt: new Date(),
      approvedAt: null,
      rejectedAt: null,
      completedAt: null,
      allocationPct: dec2(proposal.allocationPct),
      allocationSleve: proposal.allocationSleeve,
      absoluteCapCzk: dec2(proposal.absoluteCapCzk),
      monthlySipCzk: dec2(proposal.monthlySipCzk),
      monthsToTarget: proposal.monthsToTarget,
      reviewDate: proposal.reviewDate,
      profitCapPct: dec2(proposal.profitCapPct),
      profitCapCzk: dec2(proposal.profitCapCzk),
      profitCapAdjustedAt: null,
      profitCapAdjustedFrom: null,
      drawdownGuardrailPct: dec2(proposal.drawdownGuardrailPct),
      drawdownHistoricalMax:
        proposal.drawdownHistoricalMax != null ? dec2(proposal.drawdownHistoricalMax) : null,
      taxFreeDate: proposal.taxFreeDate,
      preferTaxFreeExit: proposal.preferTaxFreeExit,
      proposalReasoning: proposal.proposalReasoning,
      keyMetrics: proposal.keyMetrics as object,
      approvedBy: 'user',
      approvalNote: null
    },
    create: {
      holdingId: proposal.holdingId,
      status: 'PROPOSED',
      confidence: proposal.confidence,
      allocationPct: dec2(proposal.allocationPct),
      allocationSleve: proposal.allocationSleeve,
      absoluteCapCzk: dec2(proposal.absoluteCapCzk),
      monthlySipCzk: dec2(proposal.monthlySipCzk),
      monthsToTarget: proposal.monthsToTarget,
      reviewDate: proposal.reviewDate,
      profitCapPct: dec2(proposal.profitCapPct),
      profitCapCzk: dec2(proposal.profitCapCzk),
      drawdownGuardrailPct: dec2(proposal.drawdownGuardrailPct),
      drawdownHistoricalMax:
        proposal.drawdownHistoricalMax != null ? dec2(proposal.drawdownHistoricalMax) : null,
      taxFreeDate: proposal.taxFreeDate,
      preferTaxFreeExit: proposal.preferTaxFreeExit,
      proposalReasoning: proposal.proposalReasoning,
      keyMetrics: proposal.keyMetrics as object
    }
  })
}

export async function proposeStrategiesForAllActiveHoldings() {
  const holdings = await realPrisma.holding.findMany({
    where: { status: 'ACTIVE' },
    include: { strategy: true }
  })

  const results: Array<Record<string, unknown>> = []
  for (const h of holdings) {
    const st = h.strategy?.status
    if (st === 'APPROVED' || st === 'MONITORING') {
      results.push({ holdingId: h.id, action: 'SKIPPED_APPROVED' })
      continue
    }
    try {
      const strategy = await createStrategyProposal(h.id)
      results.push({ holdingId: h.id, action: 'PROPOSED', strategyId: strategy.id })
    } catch (err) {
      results.push({ holdingId: h.id, action: 'ERROR', error: String(err) })
    }
  }
  return results
}

