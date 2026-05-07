import type { Holding } from '@prisma/client'
import type { AllocationResult } from '../calculations'
import type { BuyRow, HoldRow, SellRow } from '../allocationRowTypes'
import { calculateTaxStatus, mapCategoryToBuckets } from '../calculations'
import { num } from '../money'
import { DRIFT_THRESHOLD_PP } from './rebalanceDrift'

type HoldTargets = {
  targetEquityPct: number
  targetBondsPct: number
  targetCashPct: number
  /** When set, must match planner / rebalance drift tolerance (Area 2). */
  driftThresholdPp?: number
}

/**
 * Explicit HOLD rows for non-EXITED holdings not already in BUY/SELL recommendations.
 */
export async function generateHoldRows(
  activeHoldings: Holding[],
  buyRows: BuyRow[],
  sellRows: SellRow[],
  allocation: Pick<AllocationResult, 'equityPct' | 'bondsPct' | 'cashPct'>,
  targets: HoldTargets
): Promise<HoldRow[]> {
  const recommendedIsins = new Set<string>([
    ...buyRows.map((r) => r.isin).filter(Boolean) as string[],
    ...sellRows.map((r) => r.isin)
  ])

  const today = new Date()
  const rows: HoldRow[] = []

  const overEq = allocation.equityPct - targets.targetEquityPct
  const overBd = allocation.bondsPct - targets.targetBondsPct
  const overCa = allocation.cashPct - targets.targetCashPct
  const driftThr = targets.driftThresholdPp ?? DRIFT_THRESHOLD_PP

  function bucketDriftOk(h: Holding): boolean {
    const w = mapCategoryToBuckets(h.category)
    if (w.eq >= 0.5 && w.bd < 0.5) return overEq <= driftThr
    if (w.bd >= 0.5) return overBd <= driftThr
    return overCa <= driftThr
  }

  for (const h of activeHoldings) {
    if (recommendedIsins.has(h.isin)) continue

    const val = num(h.currentValueCzk)

    if (h.status === 'INACTIVE') {
      rows.push({
        type: 'HOLD',
        isin: h.isin,
        currentValueCzk: val,
        holdReason: 'TACTICAL_HOLD',
        amountCzk: 0,
        reason: `Held but not actively investing. Was: ${h.category}. Reason: legacy position.`,
        executionStatus: 'PENDING',
        currency: 'CZK'
      })
      continue
    }

    if (val <= 0 || (num(h.units) > 0 && num(h.nav) <= 0)) {
      rows.push({
        type: 'HOLD',
        isin: h.isin,
        currentValueCzk: val,
        holdReason: 'INSUFFICIENT_DATA',
        amountCzk: 0,
        reason: 'Hold. Insufficient NAV/position data for a buy or sell call.',
        executionStatus: 'PENDING',
        currency: 'CZK'
      })
      continue
    }

    if ((h.country || '').toUpperCase() === 'CZ') {
      const t = calculateTaxStatus(h, today)
      const daysToFree = t.daysUntilTaxFree
      if (!t.isTaxFree && daysToFree > 0 && daysToFree <= 90) {
        rows.push({
          type: 'HOLD',
          isin: h.isin,
          currentValueCzk: val,
          holdReason: 'TAX_WINDOW_NEAR',
          daysToAction: daysToFree,
          amountCzk: 0,
          reason: `Hold. Tax-free in ${daysToFree} days. Do not disturb.`,
          executionStatus: 'PENDING',
          currency: 'CZK'
        })
        continue
      }
      if (t.isTaxFree && bucketDriftOk(h)) {
        rows.push({
          type: 'HOLD',
          isin: h.isin,
          currentValueCzk: val,
          holdReason: 'TAX_WINDOW_HOLD',
          amountCzk: 0,
          reason:
            'Hold. Tax-free window passed; bucket within drift tolerance — no rebalance sell selected for this line.',
          executionStatus: 'PENDING',
          currency: 'CZK'
        })
        continue
      }
    }

    rows.push({
      type: 'HOLD',
      isin: h.isin,
      currentValueCzk: val,
      holdReason: 'AT_TARGET',
      amountCzk: 0,
      reason: 'Hold. Bucket within drift tolerance vs target allocation.',
      executionStatus: 'PENDING',
      currency: 'CZK'
    })
  }

  return rows
}
