import type { Holding } from '@prisma/client'
import type { SellRow } from '../allocationRowTypes'
import { getPrisma } from '../prisma'
import { num } from '../money'
import { calculateAllocation, calculateTaxStatus, mapCategoryToBuckets } from '../calculations'
import { costBasisCzk } from './taxFreeExit'

/** @deprecated use driftThresholdPpForRiskProfile — kept for backward compatibility */
export const DRIFT_THRESHOLD_PP = 10

/** Drift tolerance (percentage points) before REBALANCE_DRIFT sells; wider for higher risk appetite. */
export function driftThresholdPpForRiskProfile(riskProfileRaw: string | null | undefined): number {
  const u = String(riskProfileRaw || 'MODERATE').trim().toUpperCase()
  if (u === 'CONSERVATIVE') return 10
  if (u === 'AGGRESSIVE') return 20
  return 15
}

const CZ_GAIN_TAX = 0.15

/** True if within 90 days of Czech tax-free date and should not be sold for drift (positive gain). */
export function inTaxDeferWindow(h: Holding, today = new Date()): boolean {
  if ((h.country || 'CZ').toUpperCase() !== 'CZ') return false
  const t = calculateTaxStatus(h, today)
  if (t.isTaxFree) return false
  if (t.daysUntilTaxFree <= 0 || t.daysUntilTaxFree > 90) return false
  const value = num(h.currentValueCzk)
  const basis = costBasisCzk(h as Holding & { cashflows?: { amountCzk: unknown; type: string }[] })
  const gain = basis > 0 ? value - basis : value * 0.01
  return gain > 0
}

function bucketForHolding(h: Holding): 'EQUITY' | 'BONDS' | 'CASH' {
  const w = mapCategoryToBuckets(h.category)
  if (w.eq >= 0.5 && w.bd < 0.5) return 'EQUITY'
  if (w.bd >= 0.5) return 'BONDS'
  return 'CASH'
}

function estimatedCzechSellTaxCzk(h: Holding): number {
  const t = calculateTaxStatus(h, new Date())
  if (t.isTaxFree) return 0
  const value = num(h.currentValueCzk)
  const basis = costBasisCzk(h as Holding & { cashflows?: { amountCzk: unknown; type: string }[] })
  const invested = basis > 0 ? basis : value * 0.85
  const gain = Math.max(0, value - invested)
  return Math.round(gain * CZ_GAIN_TAX)
}

export type SellCandidate = {
  name: string
  isin: string
  sellAmount: number
  estimatedTax: number
  currentValue: number
  unitsToSell: number | null
  holding: Holding
}

/**
 * Pick holdings in `bucket` to cover `amountNeededCzk`, excluding tax-window deferrals.
 * Order: tax-free first, then lowest estimated tax, then larger positions.
 */
export async function selectSellCandidates(
  bucket: 'EQUITY' | 'BONDS' | 'CASH',
  amountNeededCzk: number,
  excludeIsins: Set<string>
): Promise<SellCandidate[]> {
  const prisma = await getPrisma()
  const holdings = await prisma.holding.findMany({
    where: { status: 'ACTIVE', country: 'CZ' },
    include: { cashflows: true }
  })
  const candidates: SellCandidate[] = []
  for (const h of holdings) {
    if (excludeIsins.has(h.isin)) continue
    if (bucketForHolding(h) !== bucket) continue
    if (inTaxDeferWindow(h)) continue
    const t = calculateTaxStatus(h, new Date())
    const taxFree = t.isTaxFree
    const estTax = taxFree ? 0 : estimatedCzechSellTaxCzk(h)
    const val = num(h.currentValueCzk)
    if (val <= 0) continue
    candidates.push({
      name: h.name,
      isin: h.isin,
      sellAmount: val,
      estimatedTax: estTax,
      currentValue: val,
      unitsToSell: null,
      holding: h
    })
  }
  candidates.sort((a, b) => {
    if (a.estimatedTax !== b.estimatedTax) return a.estimatedTax - b.estimatedTax
    return b.currentValue - a.currentValue
  })

  const out: SellCandidate[] = []
  let remaining = amountNeededCzk
  for (const c of candidates) {
    if (remaining <= 0) break
    const take = Math.min(c.currentValue, remaining)
    if (take <= 0) continue
    out.push({
      ...c,
      sellAmount: take,
      unitsToSell: null
    })
    remaining -= take
  }
  return out
}

export async function detectRebalanceSells(
  holdings: Holding[],
  targetEquityPct: number,
  targetBondsPct: number,
  targetCashPct: number,
  indiaSlices: { equityCzk: number; bondsCzk: number; cashCzk: number } | null,
  excludeIsins: Set<string>,
  indiaAccountSlices?: { bondsCzk: number; cashCzk: number } | null,
  driftThresholdPp: number = driftThresholdPpForRiskProfile('MODERATE')
): Promise<SellRow[]> {
  const allocation = calculateAllocation(
    holdings as any[],
    targetEquityPct,
    targetBondsPct,
    targetCashPct,
    indiaSlices,
    indiaAccountSlices ?? null
  )
  const tval = allocation.equityCzk + allocation.bondsCzk + allocation.cashCzk
  if (tval <= 0) return []

  const overEquity = allocation.equityPct - targetEquityPct
  const overBonds = allocation.bondsPct - targetBondsPct
  const overCash = allocation.cashPct - targetCashPct

  const rows: SellRow[] = []
  const overBuckets: { bucket: 'EQUITY' | 'BONDS' | 'CASH'; overPct: number; rawOverPp: number }[] = []
  if (overEquity > driftThresholdPp) {
    overBuckets.push({ bucket: 'EQUITY', overPct: overEquity - driftThresholdPp, rawOverPp: overEquity })
  }
  if (overBonds > driftThresholdPp) {
    overBuckets.push({ bucket: 'BONDS', overPct: overBonds - driftThresholdPp, rawOverPp: overBonds })
  }
  if (overCash > driftThresholdPp) {
    overBuckets.push({ bucket: 'CASH', overPct: overCash - driftThresholdPp, rawOverPp: overCash })
  }

  const used = new Set(excludeIsins)

  for (const over of overBuckets) {
    const sellAmountCzk = (over.overPct / 100) * tval
    const candidates = await selectSellCandidates(over.bucket, sellAmountCzk, used)
    for (const c of candidates) {
      used.add(c.isin)
      rows.push({
        type: 'SELL',
        source: c.name,
        isin: c.isin,
        sellSubtype: 'REBALANCE_DRIFT',
        amountCzk: Math.round(c.sellAmount),
        taxImpactCzk: Math.round(c.estimatedTax),
        currentValueCzk: Math.round(c.currentValue),
        unitsToSell: c.unitsToSell ?? undefined,
        reason:
          `${over.bucket} allocation ${over.rawOverPp.toFixed(1)}pp over target (${over.overPct.toFixed(1)}pp above ${driftThresholdPp}pp tolerance). ` +
          `Sell ~${c.sellAmount.toFixed(0)} CZK from ${c.name} to rebalance.` +
          (c.estimatedTax > 0 ? ` Estimated tax: ~${c.estimatedTax.toFixed(0)} CZK.` : ''),
        executionStatus: 'PENDING',
        currency: 'CZK'
      })
    }
  }
  return rows
}
