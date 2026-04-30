import type { AllocationPlan, ExpenseCommitment, Holding, IncomeEvent, UpcomingEvent, UserProfile } from '@prisma/client'
import type { IndiaMutualFund } from '@prisma/client'
import { prisma } from './prisma'
import { num } from './money'
import { calculateAllocation, calculateTaxStatus, indiaMfAllocationPieces } from './calculations'
import { loadAllLibrary, scoreInstrument } from './instrumentLibrary'
import type { InstrumentLibrary } from '@prisma/client'
import { getFXRates } from './fetchers'
import { detectTaxFreeExitOpportunities } from './sellEngine/taxFreeExit'
import { detectRebalanceSells } from './sellEngine/rebalanceDrift'
import { detectFdMaturityActions } from './sellEngine/fdMaturity'
import { generateHoldRows } from './sellEngine/holdReasoning'
import type { AllocationRow, BuyRow, HoldRow, SellRow } from './allocationRowTypes'

export type {
  AllocationRow,
  AllocationRowType,
  AllocationRowBase,
  BuyRow,
  HoldRow,
  PlanAllocation,
  ReserveRow,
  SellRow
} from './allocationRowTypes'
export { ensureRowType, isAdherenceRow } from './allocationRowTypes'

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
  allocations: AllocationRow[]
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

  const [incomeRows, expRows, evRows, settings, holdings, lib, accounts, indiaFunds] = await Promise.all([
    prisma.incomeEvent.findMany(),
    prisma.expenseCommitment.findMany(),
    prisma.upcomingEvent.findMany(),
    prisma.settings.findFirst(),
    prisma.holding.findMany({ where: { status: { not: 'EXITED' } }, include: { cashflows: true } }),
    loadAllLibrary(),
    prisma.account.findMany({ where: { isActive: true } }),
    prisma.indiaMutualFund.findMany().catch(() => [] as IndiaMutualFund[])
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

  let investable = totalIncome - fixed - reservedEvents - emergencyTopup

  const tgtEq = num(settings?.targetEquityPct ?? 65)
  const tgtBd = num(settings?.targetBondsPct ?? 25)
  const tgtCa = num(settings?.targetCashPct ?? 10)

  const fx = await getFXRates().catch(() => ({ EURCZK: 24.5, EURINR: 89.0, source: 'fallback', ageHours: 0 }))
  const indiaSlices =
    Array.isArray(indiaFunds) && indiaFunds.length > 0
      ? indiaMfAllocationPieces(indiaFunds, { EURCZK: fx.EURCZK, EURINR: fx.EURINR })
      : null

  const activeHoldings = holdings.filter((h) => h.status === 'ACTIVE') as Holding[]

  const taxFreeExits = await detectTaxFreeExitOpportunities()
  const sellingIsins = new Set(taxFreeExits.map((r) => r.isin))

  const fdSells = await detectFdMaturityActions()
  for (const r of fdSells) sellingIsins.add(r.isin)

  const rebalanceSells = await detectRebalanceSells(
    activeHoldings,
    tgtEq,
    tgtBd,
    tgtCa,
    indiaSlices,
    sellingIsins
  )
  for (const r of rebalanceSells) sellingIsins.add(r.isin)

  const sellProceeds = [...taxFreeExits, ...fdSells, ...rebalanceSells].reduce((s, r) => s + num(r.amountCzk), 0)
  investable += sellProceeds

  const allocations: AllocationRow[] = []
  let k = 0
  const pushRow = (row: Record<string, unknown> & { type: string; amountCzk: number; reason: string }) => {
    k += 1
    const rowKey =
      typeof row.rowKey === 'string' && row.rowKey.length > 0 ? row.rowKey : `r${k}`
    allocations.push({
      ...row,
      rowKey,
      currency: String(row.currency || 'CZK'),
      executionStatus: (row.executionStatus as AllocationRow['executionStatus']) || 'PENDING'
    } as AllocationRow)
  }

  for (const r of taxFreeExits) {
    const { rowKey: _rk, ...rest } = r
    pushRow(rest as Record<string, unknown> & { type: string; amountCzk: number; reason: string })
  }
  for (const r of fdSells) {
    const { rowKey: _rk, ...rest } = r
    pushRow(rest as Record<string, unknown> & { type: string; amountCzk: number; reason: string })
  }
  for (const r of rebalanceSells) {
    const { rowKey: _rk, ...rest } = r
    pushRow(rest as Record<string, unknown> & { type: string; amountCzk: number; reason: string })
  }

  const now = new Date()
  const addBuy = (a: Omit<BuyRow, 'rowKey' | 'executionStatus' | 'type' | 'currency'>) => {
    if (a.isin && sellingIsins.has(a.isin)) return
    pushRow({
      type: 'BUY',
      amountCzk: a.amountCzk,
      reason: a.reason,
      destination: a.destination,
      isin: a.isin,
      currency: 'CZK',
      executionStatus: 'PENDING'
    })
  }

  if (investable < 0) {
    addBuy({
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
      if (sellingIsins.has(eqH.isin)) {
        // Same-month SELL on this ISIN — do not add a BUY to the same line
      } else {
        const t = calculateTaxStatus(eqH, now)
        const nearTax = t.daysUntilTaxFree > 0 && t.daysUntilTaxFree < 90
        if (t.isTaxFree) {
          // CZ fund already past 3y tax window — do not add new library equity buys as targets
        } else if (!nearTax) {
          addBuy({
            destination: topEq.name,
            isin: topEq.isin,
            amountCzk: Math.round(eqShare * 0.6),
            reason: `Equity toward ${tgtEq}% target; top library match in George.`
          })
        } else {
          addBuy({
            destination: eqH.name,
            isin: eqH.isin,
            amountCzk: Math.round(eqShare * 0.5),
            reason: 'Equity: existing holding; tax window soon — add carefully.'
          })
        }
      }
    } else if (topEq) {
      addBuy({
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
    if (bdH && !sellingIsins.has(bdH.isin)) {
      addBuy({
        destination: bdH.name,
        isin: bdH.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: `Bond sleeve toward ${tgtBd}% target.`
      })
    } else if (topBd) {
      addBuy({
        destination: topBd.name,
        isin: topBd.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: 'Bond allocation from library.'
      })
    }

    if (emergencyTopup > 0) {
      addBuy({
        destination: 'Emergency fund (CZ savings)',
        amountCzk: Math.round(emergencyTopup),
        reason: `Build toward ${(targetEmerg / 1000).toFixed(0)}k CZK cushion.`
      })
    }
    if (caShare > 0) {
      addBuy({
        destination: 'Spending / cash buffer',
        amountCzk: Math.round(caShare),
        reason: `Cash sleeve ${tgtCa}% for near-term use.`
      })
    }
  }

  const buyRows = allocations.filter((r): r is BuyRow => r.type === 'BUY')
  const sellRows = allocations.filter((r): r is SellRow => r.type === 'SELL')
  const allocation = calculateAllocation(activeHoldings as any[], tgtEq, tgtBd, tgtCa, indiaSlices)
  const holdRows = await generateHoldRows(activeHoldings, buyRows, sellRows, allocation, {
    targetEquityPct: tgtEq,
    targetBondsPct: tgtBd,
    targetCashPct: tgtCa
  })
  for (const h of holdRows) {
    const { rowKey: _rk, ...rest } = h
    pushRow(rest as Record<string, unknown> & { type: string; amountCzk: number; reason: string })
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
