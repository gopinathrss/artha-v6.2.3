import type { AllocationPlan, ExpenseCommitment, IncomeEvent, UpcomingEvent, UserProfile } from '@prisma/client'
import { prisma } from './prisma'
import { num } from './money'
import { calculateTaxStatus } from './calculations'
import { loadAllLibrary, scoreInstrument } from './instrumentLibrary'
import type { InstrumentLibrary } from '@prisma/client'

export type PlanAllocation = {
  destination: string
  isin?: string
  amountCzk: number
  currency?: string
  reason: string
  rowKey: string
  executionStatus?: 'PENDING' | 'DONE' | 'SKIPPED'
  executedAt?: string
  executedAmountCzk?: number
  skipReason?: string
}

function monthYearFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthlyIncomeCzk(events: IncomeEvent[], y: number, m: number, profile: UserProfile): number {
  let oneOff = 0
  for (const e of events) {
    const d = new Date(e.date)
    if (!e.recurring && d.getFullYear() === y && d.getMonth() + 1 === m) oneOff += num(e.amountCzk)
  }
  let recurring = 0
  for (const e of events) {
    if (e.recurring) recurring += num(e.amountCzk)
  }
  if (recurring === 0) recurring = num(profile.monthlyNetIncomeCzk)
  return recurring + oneOff
}

export function monthlyFixedCzk(commitments: ExpenseCommitment[], ref: Date): number {
  let s = 0
  for (const c of commitments) {
    if (!c.active) continue
    if (c.endDate && ref > c.endDate) continue
    if (c.startDate > ref) continue
    const f = c.frequency.toUpperCase()
    if (f === 'MONTHLY') s += num(c.amountCzk)
    else if (f === 'QUARTERLY') s += num(c.amountCzk) / 3
    else if (f === 'YEARLY') s += num(c.amountCzk) / 12
    else if (f === 'ONE_TIME') s += 0
  }
  return s
}

export function reservedForEventsCzk(events: UpcomingEvent[], ref: Date): number {
  const end = new Date(ref)
  end.setDate(end.getDate() + 90)
  let reserve = 0
  for (const ev of events) {
    if (ev.status !== 'UPCOMING') continue
    const ed = new Date(ev.eventDate)
    if (ed < ref || ed > end) continue
    const days = Math.max(1, Math.ceil((ed.getTime() - ref.getTime()) / 86400000))
    const months = Math.max(1, days / 30)
    const left = Math.max(0, num(ev.budgetCzk) - num(ev.reservedCzk))
    reserve += left / months
  }
  return Math.round(reserve)
}

export type MonthlyPlanPayload = {
  monthYear: string
  totalAvailableCzk: number
  fixedExpensesCzk: number
  reservedEventsCzk: number
  investableCzk: number
  emergencyTopupCzk: number
  allocations: PlanAllocation[]
}

/** Compute next month’s YYYY-MM (for report draft preview, no DB write). */
export function nextMonthYearString(): string {
  const d = new Date()
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return monthYearFrom(n)
}

export async function buildMonthlyPlanPayload(monthYear: string): Promise<MonthlyPlanPayload> {
  const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
  if (!profile) {
    throw new Error('Complete your profile in the onboarding wizard (Settings) first.')
  }
  const my = monthYear
  const [y, mo] = my.split('-').map((x) => parseInt(x, 10))
  const ref = new Date(y, mo - 1, 15)

  const [incomeRows, expRows, evRows, settings, holdings, lib, accounts] = await Promise.all([
    prisma.incomeEvent.findMany(),
    prisma.expenseCommitment.findMany(),
    prisma.upcomingEvent.findMany(),
    prisma.settings.findFirst(),
    prisma.holding.findMany({ where: { status: { not: 'EXITED' } } }),
    loadAllLibrary(),
    prisma.account.findMany({ where: { isActive: true } })
  ])

  const totalIncome = monthlyIncomeCzk(incomeRows, y, mo, profile)
  const fixed = monthlyFixedCzk(expRows, ref)
  const reservedEvents = reservedForEventsCzk(evRows, ref)

  const cashCzk = accounts
    .filter((a) => a.type === 'SAVINGS' || a.type === 'NRE')
    .reduce((s, a) => s + num(a.balanceCzk), 0)
  const targetEmerg = num(profile.emergencyFundTarget) || fixed * 6
  const gap = Math.max(0, targetEmerg - cashCzk)
  const emergencyTopup = gap > 0 ? Math.min(gap / 12, totalIncome * 0.15) : 0

  const investable = totalIncome - fixed - reservedEvents - emergencyTopup

  const tgtEq = num(settings?.targetEquityPct ?? 65)
  const tgtBd = num(settings?.targetBondsPct ?? 25)
  const tgtCa = num(settings?.targetCashPct ?? 10)

  const now = new Date()
  const allocations: PlanAllocation[] = []
  let k = 0
  const add = (a: Omit<PlanAllocation, 'rowKey' | 'executionStatus' | 'currency'>) => {
    k += 1
    allocations.push({
      ...a,
      rowKey: `r${k}`,
      currency: 'CZK',
      executionStatus: 'PENDING'
    })
  }

  if (investable < 0) {
    add({
      destination: 'Review fixed costs',
      amountCzk: 0,
      reason: `Deficit: income ${totalIncome.toFixed(0)} vs obligations ${(fixed + reservedEvents + emergencyTopup).toFixed(0)} CZK. Cut subscriptions or delay events.`
    })
  } else {
    const libScore = (i: InstrumentLibrary) => (i.score != null ? num(i.score) : scoreInstrument(i))
    const eqShare = (investable * tgtEq) / 100
    const bdShare = (investable * tgtBd) / 100
    const caShare = (investable * tgtCa) / 100

    const eqH = holdings.find((h) => h.category === 'EQUITY' && h.status === 'ACTIVE')
    const topEq = lib
      .filter((i) => i.category === 'EQUITY' && libScore(i) > 0)
      .sort((a, b) => libScore(b) - libScore(a))[0]
    if (eqH && topEq) {
      const t = calculateTaxStatus(eqH, now)
      const nearTax = t.daysUntilTaxFree > 0 && t.daysUntilTaxFree < 90
      if (t.isTaxFree) {
        // CZ fund already past 3y tax window — do not add new library equity buys as targets
      } else if (!nearTax) {
        add({
          destination: topEq.name,
          isin: topEq.isin,
          amountCzk: Math.round(eqShare * 0.6),
          reason: `Equity toward ${tgtEq}% target; top library match in George.`
        })
      } else {
        add({
          destination: eqH.name,
          isin: eqH.isin,
          amountCzk: Math.round(eqShare * 0.5),
          reason: 'Equity: existing holding; tax window soon — add carefully.'
        })
      }
    } else if (topEq) {
      add({
        destination: topEq.name,
        isin: topEq.isin,
        amountCzk: Math.round(eqShare * 0.6),
        reason: `Equity allocation — no active equity holding; candidate from library.`
      })
    }

    const bdH = holdings.find((h) => h.category === 'BONDS' && h.status === 'ACTIVE')
    const topBd = lib
      .filter((i) => i.category === 'BONDS')
      .sort((a, b) => libScore(b) - libScore(a))[0]
    if (bdH) {
      add({
        destination: bdH.name,
        isin: bdH.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: `Bond sleeve toward ${tgtBd}% target.`
      })
    } else if (topBd) {
      add({
        destination: topBd.name,
        isin: topBd.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: 'Bond allocation from library.'
      })
    }

    if (emergencyTopup > 0) {
      add({
        destination: 'Emergency fund (CZ savings)',
        amountCzk: Math.round(emergencyTopup),
        reason: `Build toward ${(targetEmerg / 1000).toFixed(0)}k CZK cushion.`
      })
    }
    if (caShare > 0) {
      add({
        destination: 'Spending / cash buffer',
        amountCzk: Math.round(caShare),
        reason: `Cash sleeve ${tgtCa}% for near-term use.`
      })
    }
  }

  return {
    monthYear: my,
    totalAvailableCzk: totalIncome,
    fixedExpensesCzk: fixed,
    reservedEventsCzk: reservedEvents,
    investableCzk: investable,
    emergencyTopupCzk: emergencyTopup,
    allocations
  }
}

export async function generateMonthlyPlan(
  monthYear: string,
  planSource: 'MANUAL' | 'AUTO_CRON' = 'MANUAL'
): Promise<AllocationPlan> {
  const p = await buildMonthlyPlanPayload(monthYear)
  return prisma.allocationPlan.create({
    data: {
      monthYear: p.monthYear,
      totalAvailableCzk: p.totalAvailableCzk,
      fixedExpensesCzk: p.fixedExpensesCzk,
      reservedEventsCzk: p.reservedEventsCzk,
      investableCzk: p.investableCzk,
      emergencyTopupCzk: p.emergencyTopupCzk,
      allocations: p.allocations as any,
      status: 'PROPOSED',
      planSource
    }
  })
}

export function currentMonthYear(): string {
  return monthYearFrom(new Date())
}

export async function getPlanForMonth(monthYear: string) {
  return prisma.allocationPlan.findFirst({ where: { monthYear }, orderBy: { generatedAt: 'desc' } })
}
