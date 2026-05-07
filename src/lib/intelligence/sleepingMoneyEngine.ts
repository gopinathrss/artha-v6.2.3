import type { PrismaClient } from '@prisma/client'
import { AccountRole } from '@prisma/client'
import { accountToCzk, type FxSnapshot } from '../accountToCzk'
import { getFXRates } from '../fetchers'
import { num } from '../money'
import {
  computeAnnualInterest,
  computeSleepingAmount,
  effectiveRatePct,
  marginalRatePct,
  parseInterestTiersJson
} from './interestTiers'

export { parseInterestTiersJson } from './interestTiers'

export type AccountEfficiency = {
  accountId: string
  accountName: string
  currency: string
  accountRole: string
  balanceCzk: number
  balanceLocal: number
  annualInterestCzk: number
  effectiveRatePct: number
  marginalRatePct: number
  inflationRatePct: number
  sleepingCzk: number
  annualRealLossCzk: number
  breakdown: string
  fxExposureNote: string | null
  isGeoStrategic: boolean
}

export type SleepingMoneyReport = {
  generatedAt: Date
  inflationRatePct: number
  totalSleepingCzk: number
  totalAnnualRealLossCzk: number
  accounts: AccountEfficiency[]
  alertLevel: 'NONE' | 'INFO' | 'WARN' | 'CRITICAL'
  summary: string
  deployableIdeas: string[]
}

const CZ_INFLATION_KEY = 'CZ_INFLATION_PCT'
const GEO_INR_INFLATION_PCT = 4.5

export async function getInflationRate(prisma: PrismaClient): Promise<number> {
  try {
    const row = await prisma.macroData.findUnique({ where: { key: CZ_INFLATION_KEY } })
    if (row?.valueDecimal != null) {
      const v = num(row.valueDecimal)
      if (Number.isFinite(v) && v > 0) return v
    }
  } catch {
    /* table missing pre-migrate */
  }
  return 2.5
}

function buildSummaryParagraph(
  totalSleepingCzk: number,
  totalAnnualRealLossCzk: number,
  inflationPct: number,
  accounts: AccountEfficiency[]
): string {
  if (totalSleepingCzk === 0) {
    return 'All your cash is working efficiently. No sleeping money detected.'
  }
  const sleepingAccounts = accounts.filter((a) => a.sleepingCzk > 0)
  const accountNames = sleepingAccounts.map((a) => a.accountName).join(' and ')
  return (
    `You have ${Math.round(totalSleepingCzk).toLocaleString('cs-CZ')} Kč sleeping in ` +
    `${accountNames}. At ${inflationPct}% inflation, this cash is losing ` +
    `approximately ${Math.round(totalAnnualRealLossCzk).toLocaleString('cs-CZ')} Kč of ` +
    `real purchasing power every year by sitting below the inflation rate. ` +
    `This is not an emergency — but it is an opportunity to put this money to work.`
  )
}

function buildDeployableIdeas(
  totalSleepingCzk: number,
  accounts: AccountEfficiency[],
  _emergencyTargetCzk: number
): string[] {
  if (totalSleepingCzk <= 0) return []
  const ideas: string[] = []
  const moveAmt = Math.min(totalSleepingCzk, 200_000)
  ideas.push(
    `Move ${Math.round(moveAmt).toLocaleString('cs-CZ')} Kč to a higher-yield savings account (look for 4–5% p.a. in CZ market).`
  )
  if (totalSleepingCzk >= 100_000) {
    const half = Math.round((totalSleepingCzk * 0.5) / 1000) * 1000
    ideas.push(
      `Allocate ${half.toLocaleString('cs-CZ')} Kč into equity ETFs over 12 months via your existing strategy plan (historical return: 8–12% p.a.).`
    )
  }
  if (totalSleepingCzk >= 50_000) {
    const third = Math.round((totalSleepingCzk * 0.3) / 1000) * 1000
    ideas.push(
      `Park ${third.toLocaleString('cs-CZ')} Kč in Czech bond funds (yield often ~4–5%, lower risk than equity, better than near-zero savings tiers).`
    )
  }
  const nreAccounts = accounts.filter((a) => a.isGeoStrategic && a.sleepingCzk > 0)
  if (nreAccounts.length > 0) {
    ideas.push(
      `For your NRE account: Indian FD rates are often 6.5–7.5% p.a. (tax-free for NRE). Consider a 1-year FD ladder for the idle portion.`
    )
  }
  return ideas
}

export async function computeCapitalEfficiency(prisma: PrismaClient): Promise<SleepingMoneyReport> {
  const inflationPct = await getInflationRate(prisma)
  const accounts = await prisma.account.findMany({ where: { isActive: true } })
  const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } }).catch(() => null)
  const emergencyTargetCzk = profile?.emergencyFundTarget != null ? num(profile.emergencyFundTarget) : 200_000

  const fxApi = await getFXRates().catch(() => ({ EURCZK: 24.5, EURINR: 89.0 }))
  const fx: FxSnapshot = { EURCZK: fxApi.EURCZK, EURINR: fxApi.EURINR }

  const accountEfficiencies: AccountEfficiency[] = []
  let totalSleepingCzk = 0
  let totalAnnualRealLossCzk = 0

  for (const account of accounts) {
    const czkDec = accountToCzk(
      { balanceLocal: account.balanceLocal, currency: account.currency || 'CZK' },
      fx
    )
    const balanceCzk = num(czkDec)

    const tiers = parseInterestTiersJson(account.interestTiers as unknown)
    const role = account.accountRole ?? AccountRole.INVESTABLE
    const isGeoStrategic = role === AccountRole.GEO_STRATEGIC
    const effectiveInflation = isGeoStrategic ? GEO_INR_INFLATION_PCT : inflationPct

    let sleepingResult: ReturnType<typeof computeSleepingAmount>
    if (isGeoStrategic && tiers.length === 0) {
      sleepingResult = {
        sleepingCzk: 0,
        sleepingRatePct: 0,
        annualRealLossCzk: 0,
        breakdown: 'Geo strategic reserve — tier analysis skipped (no interest tiers on file).'
      }
    } else {
      const perAccountEmergency =
        role === AccountRole.LONG_TERM_RESERVE || role === AccountRole.EMERGENCY_FUND
          ? (account.emergencyFundTarget != null ? num(account.emergencyFundTarget) : emergencyTargetCzk)
          : 0
      sleepingResult = computeSleepingAmount(balanceCzk, tiers, effectiveInflation, perAccountEmergency)
    }

    const annualInterest = computeAnnualInterest(balanceCzk, tiers)
    const effective = effectiveRatePct(balanceCzk, tiers)
    const marginal = marginalRatePct(balanceCzk, tiers)

    let fxExposureNote: string | null = null
    if (isGeoStrategic && String(account.currency || '').toUpperCase() === 'INR') {
      fxExposureNote =
        account.fxTrendNote ||
        `INR/CZK position: ${Math.round(balanceCzk).toLocaleString('cs-CZ')} Kč equivalent. FX risk: INR volatility affects Kč value.`
    }

    if (
      sleepingResult.sleepingCzk > 10_000 &&
      !isGeoStrategic &&
      role !== AccountRole.LOCKED &&
      role !== AccountRole.EMERGENCY_FUND
    ) {
      await prisma.account
        .update({
          where: { id: account.id },
          data: {
            accountRole: AccountRole.SLEEPING,
            capitalEfficiencyNote: sleepingResult.breakdown
          }
        })
        .catch(() => {})
    }

    totalSleepingCzk += sleepingResult.sleepingCzk
    totalAnnualRealLossCzk += sleepingResult.annualRealLossCzk

    accountEfficiencies.push({
      accountId: account.id,
      accountName: account.name,
      currency: account.currency || 'CZK',
      accountRole: role,
      balanceCzk,
      balanceLocal: num(account.balanceLocal),
      annualInterestCzk: annualInterest,
      effectiveRatePct: effective,
      marginalRatePct: marginal,
      inflationRatePct: effectiveInflation,
      sleepingCzk: sleepingResult.sleepingCzk,
      annualRealLossCzk: sleepingResult.annualRealLossCzk,
      breakdown: sleepingResult.breakdown,
      fxExposureNote,
      isGeoStrategic
    })
  }

  const alertLevel: SleepingMoneyReport['alertLevel'] =
    totalSleepingCzk === 0 ? 'NONE' : totalSleepingCzk < 50_000 ? 'INFO' : totalSleepingCzk < 200_000 ? 'WARN' : 'CRITICAL'

  const summary = buildSummaryParagraph(totalSleepingCzk, totalAnnualRealLossCzk, inflationPct, accountEfficiencies)
  const deployableIdeas = buildDeployableIdeas(totalSleepingCzk, accountEfficiencies, emergencyTargetCzk)

  return {
    generatedAt: new Date(),
    inflationRatePct: inflationPct,
    totalSleepingCzk,
    totalAnnualRealLossCzk,
    accounts: accountEfficiencies,
    alertLevel,
    summary,
    deployableIdeas
  }
}
