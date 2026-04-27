import { prisma } from './prisma'

export interface DTAAResult {
  withoutDTAA: number
  withDTAA: number
  annualSavingInr: number
  annualSavingCzk: number
}

export interface FCNRComparison {
  nreRatePct: number
  fcnrRatePct: number
  eurInr: number
  breakEvenInrDepreciationPct: number
  recommendation: string
}

export async function fetchRBIRate(): Promise<void> {
  const prev = await prisma.indiaIntelligence.findFirst({
    where: { dataType: 'RBI_RATE' },
    orderBy: { validFrom: 'desc' }
  })
  const newVal = 6.5
  const prevVal = prev?.value
  const dir =
    prevVal == null
      ? 'STABLE'
      : newVal > (prevVal ?? 0)
        ? 'UP'
        : newVal < (prevVal ?? 0)
          ? 'DOWN'
          : 'STABLE'
  await prisma.indiaIntelligence.create({
    data: {
      dataType: 'RBI_RATE',
      value: newVal,
      previousValue: prevVal ?? null,
      changeDirection: dir,
      source: 'RBI_REPOLICY_EST',
      validFrom: new Date()
    }
  })
}

const NRE_SEED: { bank: string; tenor: string; value: number }[] = [
  { bank: 'HDFC Bank', tenor: '1yr', value: 7.25 },
  { bank: 'HDFC Bank', tenor: '2yr', value: 7.25 },
  { bank: 'HDFC Bank', tenor: '3yr', value: 7 },
  { bank: 'SBI', tenor: '1yr', value: 7.0 },
  { bank: 'SBI', tenor: '2yr', value: 7.0 },
  { bank: 'SBI', tenor: '3yr', value: 6.8 },
  { bank: 'ICICI Bank', tenor: '1yr', value: 7.1 },
  { bank: 'ICICI Bank', tenor: '2yr', value: 7.1 },
  { bank: 'ICICI Bank', tenor: '3yr', value: 7.0 },
  { bank: 'Axis Bank', tenor: '1yr', value: 7.2 },
  { bank: 'Axis Bank', tenor: '2yr', value: 7.15 },
  { bank: 'Axis Bank', tenor: '3yr', value: 7.0 },
  { bank: 'Kotak', tenor: '1yr', value: 7.15 },
  { bank: 'Kotak', tenor: '2yr', value: 7.1 },
  { bank: 'Kotak', tenor: '3yr', value: 7.0 }
]

export async function seedNREFDRates(): Promise<void> {
  const c = await prisma.indiaIntelligence.count({ where: { dataType: 'NRE_FD_RATE' } })
  if (c > 0) return
  for (const r of NRE_SEED) {
    await prisma.indiaIntelligence.create({
      data: {
        dataType: 'NRE_FD_RATE',
        bankName: r.bank,
        tenor: r.tenor,
        value: r.value,
        source: 'BANK_CARDS_APR_2026',
        validFrom: new Date('2026-04-01')
      }
    })
  }
}

export async function getBestNREFDRate(tenor: string) {
  const rows = await prisma.indiaIntelligence.findMany({
    where: { dataType: 'NRE_FD_RATE', tenor },
    orderBy: { value: 'desc' },
    take: 1
  })
  return rows[0] ?? null
}

export function calculateDTAABenefit(
  nroInterestInr: number,
  _rbiRatePct: number,
  eurCzk: number,
  eurInr: number
): DTAAResult {
  const without = nroInterestInr * 0.3
  const withD = nroInterestInr * 0.15
  const savedInr = without - withD
  return {
    withoutDTAA: without,
    withDTAA: withD,
    annualSavingInr: savedInr,
    annualSavingCzk: savedInr * (eurCzk / eurInr)
  }
}

export function compareFCNRvsNRE(
  _amountInr: number,
  tenor: number,
  rates: { eurCzk: number; eurInr: number }
): FCNRComparison {
  const fcnrRate = 3.5
  const nreRate = 7.1
  const eurInr = rates.eurInr
  const be = ((nreRate - fcnrRate) / 100) * 100
  return {
    nreRatePct: nreRate,
    fcnrRatePct: fcnrRate,
    eurInr,
    breakEvenInrDepreciationPct: Math.max(0, be),
    recommendation:
      tenorHorizonLabel(tenor) +
      ` FCNR ~${fcnrRate}% vs NRE ~${nreRate}%. If INR weakens by more than ~${be.toFixed(1)}% p.a. vs your horizon, re-evaluate FCNR.`
  }
}

function tenorHorizonLabel(years: number): string {
  if (years <= 1) return 'Short horizon:'
  if (years <= 3) return 'Medium horizon:'
  return 'Long horizon:'
}

export function getNRIEligibleMutualFunds(): string[] {
  return [
    'HDFC Mutual Fund (most non-US schemes)',
    'ICICI Prudential (select schemes)',
    'SBI Mutual Fund (core schemes)',
    'Axis Mutual Fund (core schemes)',
    'Note: eligibility varies; verify KYC/CRS with each AMC.'
  ]
}
