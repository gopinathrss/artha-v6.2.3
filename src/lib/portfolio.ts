import { getPrisma, realPrisma } from './prisma'
import { getMergedSettings } from './appSettingsMerge'
import { num, type MoneyInput } from './money'
import {
  calculateXIRR,
  calculateNetWorth,
  calculateAllocation,
  calculateHealth,
  calculateConfidence,
  computeHoldingsPriceAgeHours,
  indiaMfAllocationPieces,
  indiaAccountSlicesFromAccounts,
  projectFutureValue,
  calculateTaxStatus
} from './calculations'
import { getFXRates } from './fetchers'
import { findMomComparisonSnapshot, momChangeLabel } from './momChange'

type CashflowLike = {
  amountCzk: unknown
  type: string | null | undefined
  holdingId?: string | null
  date?: Date | string | null
}

/**
 * Net cash into Czech fund holdings from typed cashflows (used for «Net invested» / gain vs SIP).
 * SIP and LUMP_SUM count by magnitude (sign can be either way). WITHDRAWAL reduces net invested by magnitude.
 * DIVIDEND is ignored for this principal-style total.
 *
 * Rows with the same (holdingId, calendar day, type, amount) are counted once so duplicate imports
 * or double-created API rows do not inflate the total.
 */
export function netCashInvestedCzkFromCashflows(cashflows: CashflowLike[]): number {
  const seen = new Set<string>()
  let sum = 0
  for (const c of cashflows) {
    const t = String(c?.type ?? '').toUpperCase()
    const a = num(c?.amountCzk as MoneyInput)
    const hid = String(c?.holdingId ?? '')
    const d = c?.date != null ? new Date(c.date as Date | string) : null
    const day = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''
    const rounded = Math.round(a * 100) / 100
    const key = `${hid}|${day}|${t}|${rounded}`
    if (seen.has(key)) continue
    seen.add(key)

    if (t === 'SIP' || t === 'LUMP_SUM') sum += Math.abs(a)
    else if (t === 'WITHDRAWAL') sum -= Math.abs(a)
  }
  return sum
}

export async function getPortfolioSummary() {
  try {
    const prisma = await getPrisma()
    const [holdings, accounts, settings, snapshots, indiaMutualFunds, merged] = await Promise.all([
      prisma.holding.findMany({
        where: { status: { not: 'EXITED' } },
        include: { cashflows: true }
      }),
      prisma.account.findMany({ where: { isActive: true } }),
      realPrisma.settings.findFirst(),
      prisma.snapshot.findMany({ orderBy: { date: 'desc' }, take: 60 }),
      prisma.indiaMutualFund.findMany(),
      getMergedSettings(realPrisma)
    ])

    const fxResult = await getFXRates()
    const fxRates = { EURCZK: fxResult.EURCZK, EURINR: fxResult.EURINR }

    const allCashflows = holdings.flatMap((h) => h.cashflows)
    const totalInvested = netCashInvestedCzkFromCashflows(allCashflows)

    const xCashflows = allCashflows.map((c) => ({ date: c.date, amount: num(c.amountCzk) }))
    const totalValue = holdings.reduce((s, h) => s + num(h.currentValueCzk), 0)
    const xirr = calculateXIRR(xCashflows, new Date(), totalValue)

    const netWorth = calculateNetWorth(holdings, accounts, totalInvested, fxRates, indiaMutualFunds)

    const tgt = {
      equity: merged.targetEquityPct,
      bonds: merged.targetBondsPct,
      cash: merged.targetCashPct
    }
    const indiaSlices = indiaMfAllocationPieces(indiaMutualFunds, fxRates)
    const indiaAccountSlices = indiaAccountSlicesFromAccounts(accounts, fxRates)
    const allocation = calculateAllocation(
      holdings,
      num(tgt.equity),
      num(tgt.bonds),
      num(tgt.cash),
      indiaSlices,
      indiaAccountSlices
    )

    const priceAgeHours = computeHoldingsPriceAgeHours(holdings)
    const confidence = calculateConfidence(
      priceAgeHours,
      fxResult.ageHours,
      holdings.filter((h) => !h.purchaseStartDate).length,
      snapshots.length
    )
    const health = calculateHealth(holdings, accounts, snapshots, fxResult.ageHours, {
      fxRates,
      indiaMutualFunds
    })

    const rp = (merged.riskProfile || 'MODERATE').toUpperCase()
    const eqW = rp === 'AGGRESSIVE' ? 14 : rp === 'CONSERVATIVE' ? 11 : 13
    const bdW = rp === 'AGGRESSIVE' ? 7 : rp === 'CONSERVATIVE' ? 6 : 6.5
    const caW = rp === 'AGGRESSIVE' ? 4.5 : rp === 'CONSERVATIVE' ? 5.5 : 5
    const blendedReturn =
      (allocation.equityPct / 100) * eqW + (allocation.bondsPct / 100) * bdW + (allocation.cashPct / 100) * caW
    const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
    const monthlySipTotal =
      holdings.reduce((s, h) => s + num(h.monthlySipCzk), 0) ||
      num(profile?.monthlyNetIncomeCzk) * 0.35 ||
      0
    const horizon = merged.targetDate
      ? (new Date(merged.targetDate).getTime() - Date.now()) / (365.25 * 86400000)
      : 10
    const goalFV = merged.targetWealthCzk
      ? projectFutureValue(netWorth.totalCzk, blendedReturn, horizon, monthlySipTotal)
      : null
    const projectedFV = projectFutureValue(netWorth.totalCzk, blendedReturn, horizon, monthlySipTotal)

    const now = new Date()
    const taxCalendar = holdings
      .map((h) => ({
        ...h,
        tax: calculateTaxStatus(h, now)
      }))
      .sort((a, b) => a.tax.daysUntilTaxFree - b.tax.daysUntilTaxFree)

    const momCmp = findMomComparisonSnapshot(snapshots, now)
    const momChange = momCmp.snapshot
      ? {
          czk: netWorth.totalCzk - num(momCmp.snapshot.netWorthCzk),
          pct:
            num(momCmp.snapshot.netWorthCzk) === 0
              ? null
              : ((netWorth.totalCzk - num(momCmp.snapshot.netWorthCzk)) /
                  num(momCmp.snapshot.netWorthCzk)) *
                100,
          label: momChangeLabel(momCmp.tier, momCmp.snapshot.date, momCmp.ageDays),
          tier: momCmp.tier
        }
      : {
          czk: null,
          pct: null,
          label: momChangeLabel(null, null, momCmp.ageDays),
          tier: null
        }

    return {
      success: true,
      data: {
        netWorth,
        allocation,
        allocationTargets: {
          equityPct: num(tgt.equity),
          bondsPct: num(tgt.bonds),
          cashPct: num(tgt.cash)
        },
        xirr,
        health,
        confidence,
        totalInvested,
        momChange,
        blendedReturn,
        goalFV,
        projectedFV,
        taxCalendar,
        holdings,
        holdingsCount: holdings.length,
        activeCount: holdings.filter((h) => h.status === 'ACTIVE').length,
        fxRates,
        settings,
        snapshots: snapshots.slice(0, 13).reverse()
      }
    }
  } catch (err: any) {
    return { success: false, error: err.message, data: null }
  }
}
