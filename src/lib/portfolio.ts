import { prisma } from './prisma'
import { num } from './money'
import {
  calculateXIRR,
  calculateNetWorth,
  calculateAllocation,
  calculateHealth,
  calculateConfidence,
  computeHoldingsPriceAgeHours,
  indiaMfAllocationPieces,
  projectFutureValue,
  calculateTaxStatus
} from './calculations'
import { getFXRates } from './fetchers'

export async function getPortfolioSummary() {
  try {
    const [holdings, accounts, settings, snapshots, indiaMutualFunds] = await Promise.all([
      prisma.holding.findMany({
        where: { status: { not: 'EXITED' } },
        include: { cashflows: true }
      }),
      prisma.account.findMany({ where: { isActive: true } }),
      prisma.settings.findFirst(),
      prisma.snapshot.findMany({ orderBy: { date: 'desc' }, take: 13 }),
      prisma.indiaMutualFund.findMany()
    ])

    const fxResult = await getFXRates()
    const fxRates = { EURCZK: fxResult.EURCZK, EURINR: fxResult.EURINR }

    const allCashflows = holdings.flatMap((h) => h.cashflows)
    const totalInvested = allCashflows
      .filter((c) => num(c.amountCzk) < 0)
      .reduce((s, c) => s + Math.abs(num(c.amountCzk)), 0)

    const xCashflows = allCashflows.map((c) => ({ date: c.date, amount: num(c.amountCzk) }))
    const totalValue = holdings.reduce((s, h) => s + num(h.currentValueCzk), 0)
    const xirr = calculateXIRR(xCashflows, new Date(), totalValue)

    const netWorth = calculateNetWorth(holdings, accounts, totalInvested, fxRates, indiaMutualFunds)

    const tgt = {
      equity: settings?.targetEquityPct ?? 65,
      bonds: settings?.targetBondsPct ?? 25,
      cash: settings?.targetCashPct ?? 10
    }
    const indiaSlices = indiaMfAllocationPieces(indiaMutualFunds, fxRates)
    const allocation = calculateAllocation(
      holdings,
      num(tgt.equity),
      num(tgt.bonds),
      num(tgt.cash),
      indiaSlices
    )

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

    const today = new Date()
    const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
    const subDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
    const monthAgoSnapshot = await prisma.snapshot.findFirst({
      where: {
        date: {
          gte: subDays(oneMonthAgo, 3),
          lte: addDays(oneMonthAgo, 3)
        }
      },
      orderBy: { date: 'desc' }
    })
    const momChange = monthAgoSnapshot
      ? {
          czk: netWorth.totalCzk - num(monthAgoSnapshot.netWorthCzk),
          pct:
            num(monthAgoSnapshot.netWorthCzk) === 0
              ? null
              : ((netWorth.totalCzk - num(monthAgoSnapshot.netWorthCzk)) /
                  num(monthAgoSnapshot.netWorthCzk)) *
                100,
          label: `vs ${monthAgoSnapshot.date.toISOString().slice(0, 10)}`
        }
      : {
          czk: null,
          pct: null,
          label: 'MoM unavailable (no snapshot ~30 days old)'
        }

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
