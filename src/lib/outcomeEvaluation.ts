import type { Prisma } from '@prisma/client'
import { getPrisma } from './prisma'

function computeOutcomeScore(o: {
  wasExecuted: boolean
  gainPctAt90d?: number | null
}): number {
  if (!o.wasExecuted) return 0
  const gain = o.gainPctAt90d ?? 0
  if (gain > 5) return 100
  if (gain > 0) return 75
  if (gain > -5) return 50
  return 25
}

/**
 * Milestone evaluation for RecommendationOutcome rows (30d / 90d).
 * Uses SipExecution matched by planId + planRowKey when present.
 */
export async function evaluatePendingOutcomes(): Promise<{ touched: number }> {
  const prisma = await getPrisma()
  const today = new Date()

  const pending = await prisma.recommendationOutcome.findMany({
    where: { status: { in: ['PENDING', 'EXECUTED_30D'] } }
  })

  let touched = 0

  for (const outcome of pending) {
    const ageDays = Math.floor((today.getTime() - outcome.recommendedAt.getTime()) / 86_400_000)

    const execution = await prisma.sipExecution.findFirst({
      where: {
        planId: outcome.planId,
        planRowKey: outcome.rowKey
      },
      orderBy: { createdAt: 'desc' }
    })

    const fallbackExecution =
      !execution &&
      (await prisma.sipExecution.findFirst({
        where: { planId: outcome.planId, isin: outcome.isin ?? '' },
        orderBy: { createdAt: 'desc' }
      }))

    const ex = execution ?? fallbackExecution

    const wasExecuted = !!(ex && ex.status === 'EXECUTED')
    const execAmt = ex ? Number(ex.amountCzk.toString()) : null

    const holding = outcome.isin
      ? await prisma.holding.findFirst({
          where: { isin: outcome.isin, status: { not: 'EXITED' } }
        })
      : null
    const currentValueCzk = holding ? Number(holding.currentValueCzk.toString()) : null
    const recAmt = Number(outcome.recommendedAmountCzk.toString())

    const patch: Prisma.RecommendationOutcomeUpdateInput = {
      wasExecuted,
      executedAmountCzk: execAmt
    }

    if (ageDays >= 30 && !outcome.evaluatedAt30d) {
      patch.evaluatedAt30d = today
      patch.valueAt30dCzk = currentValueCzk
      if (currentValueCzk != null && recAmt > 0) {
        patch.gainPctAt30d = ((currentValueCzk - recAmt) / recAmt) * 100
      }
      if (ageDays < 90) {
        patch.status = 'EXECUTED_30D'
      }
      touched += 1
    }

    if (ageDays >= 90 && !outcome.evaluatedAt90d) {
      if (!outcome.evaluatedAt30d && patch.evaluatedAt30d == null) {
        patch.evaluatedAt30d = today
        patch.valueAt30dCzk = currentValueCzk
        if (currentValueCzk != null && recAmt > 0) {
          patch.gainPctAt30d = ((currentValueCzk - recAmt) / recAmt) * 100
        }
      }
      patch.evaluatedAt90d = today
      patch.valueAt90dCzk = currentValueCzk
      let gain90: number | null = null
      if (currentValueCzk != null && recAmt > 0) {
        gain90 = ((currentValueCzk - recAmt) / recAmt) * 100
        patch.gainPctAt90d = gain90
      }
      patch.status = wasExecuted ? 'EXECUTED_90D' : 'SKIPPED'
      patch.outcomeScore = computeOutcomeScore({
        wasExecuted,
        gainPctAt90d: gain90
      })
      touched += 1
    }

    const hasOps =
      patch.evaluatedAt30d !== undefined ||
      patch.evaluatedAt90d !== undefined ||
      patch.wasExecuted !== undefined

    if (hasOps) {
      await prisma.recommendationOutcome.update({
        where: { id: outcome.id },
        data: patch
      })
    }
  }

  return { touched }
}
