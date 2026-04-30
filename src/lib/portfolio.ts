import { prisma } from './prisma'
import {
  calculateXIRR,
  calculateNetWorth,
  calculateAllocation,
  calculateHealth,
  calculateConfidence,
  computeHoldingsPriceAgeHours,
  projectFutureValue,
  calculateTaxStatus
} from './calculations'
import { getFXRates } from './fetchers'

export async function getPortfolioSummary() {
  try {
    const [holdings, accounts, settings, snapshots] = await Promise.all([
      prisma.holding.findMany({
        where: { status: { not: 'EXITED' } },
        include: { cashflows: true }
      }),
      prisma.account.findMany({ where: { isActive: true } }),
      prisma.settings.findFirst(),
      prisma.snapshot.findMany({ orderBy: { date: 'desc' }, take: 13 })
    ])

    const fxResult = await getFXRates()
    const fxRates = { EURCZK: fxResult.EURCZK, EURINR: fxResult.EURINR }

    const allCashflows = holdings.flatMap((h) => h.cashflows)
    const totalInvested = allCashflows
      .filter((c) => c.amountCzk < 0)
      .reduce((s, c) => s + Math.abs(c.amountCzk), 0)

    const xCashflows = allCashflows.map((c) => ({ date: c.date, amount: c.amountCzk }))
    const totalValue = holdings.reduce((s, h) => s + h.currentValueCzk, 0)
    const xirr = calculateXIRR(xCashflows, new Date(), totalValue)

    const netWorth = calculateNetWorth(holdings, accounts, totalInvested, fxRates)

    const tgt = {
      equity: settings?.targetEquityPct ?? 65,
      bonds: settings?.targetBondsPct ?? 25,
      cash: settings?.targetCashPct ?? 10
    }
    const allocation = calculateAllocation(holdings, tgt.equity, tgt.bonds, tgt.cash)

    const priceAgeHours = computeHoldingsPriceAgeHours(holdings)
    const confidence = calculateConfidence(
      priceAgeHours,
      fxResult.ageHours,
      holdings.filter((h) => !h.purchaseStartDate).length,
      snapshots.length
    )
    const health = calculateHealth(holdings, accounts, snapshots, fxResult.ageHours)

    const blendedReturn =
      (allocation.equityPct / 100) * 13 +
      (allocation.bondsPct / 100) * 6.5 +
      (allocation.cashPct / 100) * 5
    const horizon = settings?.targetDate
      ? (new Date(settings.targetDate).getTime() - Date.now()) / (365.25 * 86400000)
      : 10
    const goalFV = settings?.targetWealthCzk
      ? projectFutureValue(netWorth.totalCzk, blendedReturn, horizon, 25500)
      : null
    const projectedFV = projectFutureValue(netWorth.totalCzk, blendedReturn, horizon, 25500)

    const now = new Date()
    const taxCalendar = holdings
      .map((h) => ({
        ...h,
        tax: calculateTaxStatus(h, now)
      }))
      .sort((a, b) => a.tax.daysUntilTaxFree - b.tax.daysUntilTaxFree)

    const lastSnapshot = snapshots[1]
    const momChange = lastSnapshot
      ? {
          czk: netWorth.totalCzk - lastSnapshot.netWorthCzk,
          pct:
            lastSnapshot.netWorthCzk === 0
              ? 0
              : ((netWorth.totalCzk - lastSnapshot.netWorthCzk) / lastSnapshot.netWorthCzk) * 100
        }
      : { czk: 0, pct: 0 }

    return {
      success: true,
      data: {
        netWorth,
        allocation,
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
        snapshots: snapshots.slice(0, 12).reverse()
      }
    }
  } catch (err: any) {
    return { success: false, error: err.message, data: null }
  }
}
