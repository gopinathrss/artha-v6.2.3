import type { PrismaClient } from '@prisma/client'
import type { StrategyInput } from './types'
import { num } from '../money'
import { costBasisCzk } from '../sellEngine/taxFreeExit'
import { getMergedSettings } from '../appSettingsMerge'

function toNumDec(v: unknown): number {
  return num(v as never)
}

function normalizeRiskProfile(v: string | null | undefined): string {
  const u = String(v || 'MODERATE').trim().toUpperCase()
  if (u === 'CONSERVATIVE') return 'Conservative'
  if (u === 'AGGRESSIVE') return 'Aggressive'
  return 'Moderate'
}

export async function assembleStrategyInput(holdingId: string, prisma: PrismaClient): Promise<StrategyInput> {
  const holding = await prisma.holding.findUnique({
    where: { id: holdingId },
    include: { cashflows: true }
  })
  if (!holding) throw new Error('Holding not found: ' + holdingId)

  const costBasis = costBasisCzk({ cashflows: holding.cashflows })

  const backtestRow = await prisma.historicalNavStats
    .findFirst({
      where: { isin: holding.isin },
      orderBy: { computedAt: 'desc' }
    })
    .catch(() => null)

  const backtestStats = backtestRow
    ? {
        cagrPct5yr: backtestRow.cagr5y != null ? toNumDec(backtestRow.cagr5y) : null,
        maxDrawdownPct: backtestRow.maxDrawdownAll != null ? toNumDec(backtestRow.maxDrawdownAll) : null,
        sharpeRatio: backtestRow.sharpe3y != null ? toNumDec(backtestRow.sharpe3y) : null,
        recoveryMonths: backtestRow.recoveryMonths ?? null
      }
    : null

  const libraryRow = await prisma.instrumentLibrary
    .findUnique({
      where: { isin: holding.isin }
    })
    .catch(() => null)

  const libraryScore = libraryRow
    ? {
        score: libraryRow.score != null ? toNumDec(libraryRow.score) : null,
        terPct: libraryRow.terPct != null ? toNumDec(libraryRow.terPct) : null,
        fundSizeM: libraryRow.fundSizeM != null ? toNumDec(libraryRow.fundSizeM) : null,
        availableInGeorge: !!libraryRow.availableInGeorge
      }
    : null

  const merged = await getMergedSettings(prisma)
  const riskProfile = normalizeRiskProfile(merged.riskProfile)

  // Area 1 foundation: investable is a conservative proxy until we wire a full income-expense model.
  // This aligns with the existing portfolio summary fallback patterns.
  const profileRow = await prisma.userProfile.findUnique({ where: { id: 'default' } }).catch(() => null)
  const monthlyNetIncomeCzk = profileRow?.monthlyNetIncomeCzk != null ? toNumDec(profileRow.monthlyNetIncomeCzk) : 0
  const monthlyInvestable = Math.max(0, Math.round(monthlyNetIncomeCzk * 0.35))

  const dob = profileRow?.dateOfBirth ?? null
  const currentAge = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : 30
  const retirementAge = profileRow?.retirementAge ?? 50

  const latestSnapshot = await prisma.snapshot.findFirst({ orderBy: { date: 'desc' } }).catch(() => null)
  const currentAllocation = {
    equityPct: latestSnapshot?.equityPct != null ? toNumDec(latestSnapshot.equityPct) : 0,
    bondsPct: latestSnapshot?.bondsPct != null ? toNumDec(latestSnapshot.bondsPct) : 0,
    cashPct: latestSnapshot?.cashPct != null ? toNumDec(latestSnapshot.cashPct) : 0,
    totalCzk: latestSnapshot?.netWorthCzk != null ? toNumDec(latestSnapshot.netWorthCzk) : 0
  }

  return {
    holding: {
      id: holding.id,
      isin: holding.isin,
      name: holding.name,
      category: holding.category,
      currentValueCzk: toNumDec(holding.currentValueCzk),
      costBasisCzk: costBasis,
      monthlySipCzk: toNumDec(holding.monthlySipCzk),
      purchaseStartDate: holding.purchaseStartDate ?? new Date(),
      taxFreeDate: holding.taxFreeDate ?? null,
      status: holding.status
    },
    backtestStats,
    libraryScore,
    profile: {
      riskProfile,
      targetEquityPct: merged.targetEquityPct,
      targetBondsPct: merged.targetBondsPct,
      targetCashPct: merged.targetCashPct,
      monthlyInvestable,
      retirementAge,
      currentAge
    },
    currentAllocation
  }
}

