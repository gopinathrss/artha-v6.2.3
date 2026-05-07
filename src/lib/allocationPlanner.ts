import type { AllocationPlan, ExpenseCommitment, Holding, IncomeEvent, UpcomingEvent, UserProfile } from '@prisma/client'
import type { IndiaMutualFund } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { getPrisma, realPrisma } from './prisma'
import { assertValidMonthYear } from './allocationPlanGuards'
import { parseAllocationsJsonStrict, parsePlanAllocations } from './allocationPlanSchema'
import { replacePlanRows } from './allocationPlanRows'
import type { PlanRowClient } from './allocationPlanRows'
import { num } from './money'
import {
  calculateAllocation,
  calculateTaxStatus,
  indiaMfAllocationPieces,
  indiaAccountSlicesFromAccounts
} from './calculations'
import { accountsToCzk } from './accountToCzk'
import { loadAllLibrary, scoreInstrument } from './instrumentLibrary'
import type { InstrumentLibrary } from '@prisma/client'
import { getFXRates } from './fetchers'
import { detectTaxFreeExitOpportunities } from './sellEngine/taxFreeExit'
import { detectRebalanceSells } from './sellEngine/rebalanceDrift'
import { detectFdMaturityActions } from './sellEngine/fdMaturity'
import { generateHoldRows } from './sellEngine/holdReasoning'
import type { AllocationRow, BuyRow, HoldRow, SellRow } from './allocationRowTypes'
import { loadApprovedStrategies, type StrategyMapValue } from './intelligence/strategyContext'

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

export type PlanContinuityMeta = {
  unchangedFundsCount: number
  newFundsCount: number
  droppedFundsCount: number
  droppedFunds: { isin: string; name: string; lastAmount: number }[]
}

function computeContinuityMeta(
  prev: AllocationRow[] | null | undefined,
  next: AllocationRow[]
): PlanContinuityMeta {
  const prevBuys = (prev || []).filter((r): r is BuyRow => r.type === 'BUY' && Boolean(r.isin))
  const nextBuys = next.filter((r): r is BuyRow => r.type === 'BUY' && Boolean(r.isin))
  const prevMap = new Map(
    prevBuys.map((r) => [r.isin as string, { name: r.destination, amount: r.amountCzk }])
  )
  const nextIsins = new Set(nextBuys.map((r) => r.isin as string))
  const prevIsins = new Set(prevMap.keys())
  let unchangedFundsCount = 0
  for (const isin of nextIsins) {
    if (prevIsins.has(isin)) unchangedFundsCount += 1
  }
  const newFundsCount = [...nextIsins].filter((i) => !prevIsins.has(i)).length
  const droppedFunds: { isin: string; name: string; lastAmount: number }[] = []
  for (const isin of prevIsins) {
    if (!nextIsins.has(isin)) {
      const m = prevMap.get(isin)!
      droppedFunds.push({ isin, name: m.name, lastAmount: m.amount })
    }
  }
  return {
    unchangedFundsCount,
    newFundsCount,
    droppedFundsCount: droppedFunds.length,
    droppedFunds
  }
}

function buildStrategyReason(
  strategy: StrategyMapValue,
  holding: { name?: string | null }
): string {
  const name = String(holding.name || 'Fund').trim() || 'Fund'
  const low =
    String(strategy.confidence || '').toUpperCase() === 'LOW'
      ? ' (LOW confidence — limited history)'
      : ''
  return (
    `${name}: Approved strategy — month ${strategy.currentMonth} of ${strategy.monthsToTarget}, ` +
    `target ${Math.round(strategy.absoluteCapCzk).toLocaleString('cs-CZ')} Kč${low}.`
  )
}

function continuityBuyReason(base: string, isin: string | undefined, prev: AllocationRow[] | null): string {
  if (!isin || !prev?.length) return base
  const wasBuy = prev.some((r) => r.type === 'BUY' && r.isin === isin)
  if (wasBuy) return `${base} Continuing from last month.`
  const prevBuys = prev.filter((r): r is BuyRow => r.type === 'BUY')
  const label =
    prevBuys.find((b) => b.isin)?.destination || prevBuys[0]?.destination || 'no equity buy'
  return `${base} New vs prior plan. (Last month: ${label})`
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
  allocations: AllocationRow[]
}

/** Compute next month’s YYYY-MM (for report draft preview, no DB write). */
export function nextMonthYearString(): string {
  const d = new Date()
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return monthYearFrom(n)
}

export async function buildMonthlyPlanPayload(
  monthYear: string,
  previousAllocations?: AllocationRow[] | null
): Promise<MonthlyPlanPayload> {
  const prisma = await getPrisma()
  let prevAlloc = previousAllocations
  if (prevAlloc === undefined) {
    const prevPlan = await prisma.allocationPlan.findFirst({ orderBy: { generatedAt: 'desc' } })
    prevAlloc = prevPlan?.allocations != null ? parsePlanAllocations(prevPlan.allocations) : null
  }

  const previouslyRecommendedIsins = new Set<string>()
  if (prevAlloc) {
    for (const row of prevAlloc) {
      if (row.type === 'BUY' && row.isin) previouslyRecommendedIsins.add(row.isin)
    }
  }

  const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
  if (!profile) {
    throw new Error('Complete your profile in the onboarding wizard (Settings) first.')
  }
  const my = monthYear
  const [y, mo] = my.split('-').map((x) => parseInt(x, 10))
  const ref = new Date(y, mo - 1, 15)

  const { getMergedSettings } = await import('./appSettingsMerge')
  const [incomeRows, expRows, evRows, holdings, lib, accounts, indiaFunds, merged] = await Promise.all([
    prisma.incomeEvent.findMany(),
    prisma.expenseCommitment.findMany(),
    prisma.upcomingEvent.findMany(),
    prisma.holding.findMany({ where: { status: { not: 'EXITED' } }, include: { cashflows: true } }),
    loadAllLibrary(),
    prisma.account.findMany({ where: { isActive: true } }),
    prisma.indiaMutualFund.findMany().catch(() => [] as IndiaMutualFund[]),
    getMergedSettings(realPrisma)
  ])

  // Strategy map is loaded once per plan generation. Fallback: empty map (planner works unchanged).
  const approvedStrategies = await loadApprovedStrategies(prisma).catch(() => new Map())

  const totalIncome = monthlyIncomeCzk(incomeRows, y, mo, profile)
  const fixed = monthlyFixedCzk(expRows, ref)
  const reservedEvents = reservedForEventsCzk(evRows, ref)

  const tgtEq = merged.targetEquityPct
  const tgtBd = merged.targetBondsPct
  const tgtCa = merged.targetCashPct
  const taxWindowAllowsBuy = merged.taxFreeWindowAllowsBuy === true

  const fx = await getFXRates().catch(() => ({ EURCZK: 24.5, EURINR: 89.0, source: 'fallback', ageHours: 0 }))
  const fxRates = { EURCZK: fx.EURCZK, EURINR: fx.EURINR }
  const emergencyLiquidityAccounts = accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'NRE')
  const cashCzk = num(accountsToCzk(emergencyLiquidityAccounts, fxRates))
  const targetEmerg = num(profile.emergencyFundTarget) || fixed * 6
  const gap = Math.max(0, targetEmerg - cashCzk)
  const emergencyTopup = gap > 0 ? Math.min(gap / 12, totalIncome * 0.15) : 0

  let investable = totalIncome - fixed - reservedEvents - emergencyTopup

  const indiaSlices =
    Array.isArray(indiaFunds) && indiaFunds.length > 0 ? indiaMfAllocationPieces(indiaFunds, fxRates) : null
  const indiaAccountSlices = indiaAccountSlicesFromAccounts(accounts, fxRates)

  const investedHoldings = holdings.filter((h) => h.status !== 'EXITED') as Holding[]
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
    sellingIsins,
    indiaAccountSlices
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

  const addHold = (h: {
    name?: string
    isin?: string
    currentValueCzk?: number
    reason: string
    holdReason?: string
    daysToAction?: number | null
  }) => {
    pushRow({
      type: 'HOLD',
      amountCzk: 0,
      reason: h.reason,
      name: h.name,
      isin: h.isin,
      currentValueCzk: h.currentValueCzk ?? 0,
      holdReason: h.holdReason ?? null,
      daysToAction: h.daysToAction ?? null,
      currency: 'CZK',
      executionStatus: 'PENDING'
    })
  }

  const addBuy = (a: Omit<BuyRow, 'rowKey' | 'executionStatus' | 'type' | 'currency'>) => {
    if (a.isin && sellingIsins.has(a.isin)) return

    // Strategy-aware override: if an approved strategy exists for this holding, use its monthly SIP.
    // If cap is reached, emit HOLD instead (STRATEGY_CAP guard).
    if (a.isin) {
      const h = holdings.find((x) => x && x.isin === a.isin)
      if (h) {
        const st = approvedStrategies.get(h.id)
        if (st) {
          const cur = num(h.currentValueCzk)
          if (st.isCapReached) {
            addHold({
              name: h.name,
              isin: h.isin,
              currentValueCzk: cur,
              holdReason: 'STRATEGY_CAP',
              reason:
                `Strategy cap reached — position at ${Math.round(cur).toLocaleString('cs-CZ')} Kč, cap is ${Math.round(
                  st.absoluteCapCzk
                ).toLocaleString('cs-CZ')} Kč. Approve a new strategy to continue.`
            })
            return
          }
          a = {
            ...a,
            amountCzk: st.monthlySipCzk,
            reason: buildStrategyReason(st, h)
          }
        }
      }
    }
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
    const eqCandidates = lib.filter((i) => i.category === 'EQUITY' && libScore(i) > 0)
    const topEq = eqCandidates
      .map((i) => ({
        i,
        adj: libScore(i) + (previouslyRecommendedIsins.has(i.isin) ? 10 : 0)
      }))
      .sort((a, b) => b.adj - a.adj)[0]?.i
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
            reason: continuityBuyReason(
              `Equity toward ${tgtEq}% target; top library match in George.`,
              topEq.isin,
              prevAlloc
            )
          })
        } else if (taxWindowAllowsBuy) {
          addBuy({
            destination: eqH.name,
            isin: eqH.isin,
            amountCzk: Math.round(eqShare * 0.5),
            reason: continuityBuyReason(
              'Equity: existing holding; tax window soon — reduced BUY (override enabled in Settings).',
              eqH.isin,
              prevAlloc
            )
          })
        }
        // else: default — no BUY inside 90d tax-free window; HOLD row comes from generateHoldRows.
      }
    } else if (topEq) {
      addBuy({
        destination: topEq.name,
        isin: topEq.isin,
        amountCzk: Math.round(eqShare * 0.6),
        reason: continuityBuyReason(
          `Equity allocation — no active equity holding; candidate from library.`,
          topEq.isin,
          prevAlloc
        )
      })
    }

    const bdH = holdings.find((h) => h.category === 'BONDS' && h.status === 'ACTIVE')
    const bdCandidates = lib.filter((i) => i.category === 'BONDS')
    const topBd = bdCandidates
      .map((i) => ({
        i,
        adj: libScore(i) + (previouslyRecommendedIsins.has(i.isin) ? 10 : 0)
      }))
      .sort((a, b) => b.adj - a.adj)[0]?.i
    if (bdH && !sellingIsins.has(bdH.isin)) {
      addBuy({
        destination: bdH.name,
        isin: bdH.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: continuityBuyReason(`Bond sleeve toward ${tgtBd}% target.`, bdH.isin, prevAlloc)
      })
    } else if (topBd) {
      addBuy({
        destination: topBd.name,
        isin: topBd.isin,
        amountCzk: Math.round(bdShare * 0.5),
        reason: continuityBuyReason('Bond allocation from library.', topBd.isin, prevAlloc)
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
  const allocation = calculateAllocation(
    investedHoldings as any[],
    tgtEq,
    tgtBd,
    tgtCa,
    indiaSlices,
    indiaAccountSlices
  )
  const holdRows = await generateHoldRows(investedHoldings, buyRows, sellRows, allocation, {
    targetEquityPct: tgtEq,
    targetBondsPct: tgtBd,
    targetCashPct: tgtCa
  })
  for (const h of holdRows) {
    // STRATEGY GUARD — same effect as running before AT_TARGET inside generateHoldRows: approved
    // strategy forces BUY (or STRATEGY_CAP HOLD) instead of emitting drift-tolerance HOLD rows.
    if (h.type === 'HOLD' && h.holdReason === 'AT_TARGET' && h.isin) {
      const holding = activeHoldings.find((x) => x.isin === h.isin)
      if (holding && holding.status === 'ACTIVE' && !sellingIsins.has(holding.isin)) {
        const strategyEntry = approvedStrategies.get(holding.id)
        if (strategyEntry) {
          const cur = num(holding.currentValueCzk)
          if (strategyEntry.isCapReached) {
            addHold({
              name: holding.name,
              isin: holding.isin,
              currentValueCzk: cur,
              holdReason: 'STRATEGY_CAP',
              reason:
                `Strategy cap reached — position at ${Math.round(cur).toLocaleString('cs-CZ')} Kč, cap is ${Math.round(
                  strategyEntry.absoluteCapCzk
                ).toLocaleString('cs-CZ')} Kč. Approve a new strategy to continue.`
            })
            continue
          }
          pushRow({
            type: 'BUY',
            amountCzk: strategyEntry.monthlySipCzk,
            reason: buildStrategyReason(strategyEntry, holding),
            destination: holding.name,
            isin: holding.isin,
            currency: 'CZK',
            executionStatus: 'PENDING'
          })
          continue
        }
      }
    }
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
  const prisma = await getPrisma()
  const priorSnapshot = await prisma.allocationPlan.findFirst({
    orderBy: { generatedAt: 'desc' }
  })
  const prevRows =
    priorSnapshot?.allocations != null ? parsePlanAllocations(priorSnapshot.allocations) : null

  const p = await buildMonthlyPlanPayload(monthYear, prevRows)
  assertValidMonthYear(p.monthYear)
  const continuity = computeContinuityMeta(prevRows, p.allocations)

  const validatedBase = parseAllocationsJsonStrict(JSON.parse(JSON.stringify(p.allocations)))

  const { extractLesson } = await import('./historical/lessonExtractor')

  const planId = await prisma.$transaction(async (tx) => {
    const plan = await tx.allocationPlan.create({
      data: {
        monthYear: p.monthYear,
        totalAvailableCzk: p.totalAvailableCzk,
        fixedExpensesCzk: p.fixedExpensesCzk,
        reservedEventsCzk: p.reservedEventsCzk,
        investableCzk: p.investableCzk,
        emergencyTopupCzk: p.emergencyTopupCzk,
        allocations: validatedBase as unknown as Prisma.InputJsonValue,
        continuity: continuity as unknown as Prisma.InputJsonValue,
        status: 'PROPOSED',
        planSource
      }
    })

    const nextAlloc: AllocationRow[] = JSON.parse(JSON.stringify(validatedBase)) as AllocationRow[]
    for (let i = 0; i < nextAlloc.length; i++) {
      const row = nextAlloc[i]!
      if (row.type === 'BUY' && row.isin) {
        const lesson = await extractLesson(
          row.isin,
          {
            fundName: String(row.destination || ''),
            planId: plan.id,
            rowKey: row.rowKey ?? `${row.type}-${row.isin}`
          },
          tx
        )
        if (lesson) {
          nextAlloc[i] = {
            ...row,
            reason: `${row.reason} ${lesson.narrative}`.trim()
          } as AllocationRow
        }
      }
    }

    await tx.allocationPlan.update({
      where: { id: plan.id },
      data: { allocations: nextAlloc as unknown as Prisma.InputJsonValue }
    })

    await replacePlanRows(tx as unknown as PlanRowClient, plan.id, nextAlloc)

    const tracked = nextAlloc.filter((r) => r.type === 'BUY' || r.type === 'SELL')
    for (const row of tracked) {
      const fundName =
        row.type === 'BUY'
          ? (row.destination ?? row.isin ?? 'BUY')
          : row.type === 'SELL'
            ? (row.source ?? row.isin ?? 'SELL')
            : '—'
      await tx.recommendationOutcome.create({
        data: {
          planId: plan.id,
          rowKey: row.rowKey ?? `${row.type}-${row.isin ?? 'row'}`,
          rowType: row.type,
          isin: row.isin ?? null,
          fundName,
          recommendedAmountCzk: row.amountCzk,
          recommendedAt: plan.generatedAt,
          status: 'PENDING'
        }
      })
    }

    return plan.id
  })

  const out = await prisma.allocationPlan.findUnique({ where: { id: planId } })
  if (!out) throw new Error('Plan missing after transaction')
  return out
}

export function currentMonthYear(): string {
  return monthYearFrom(new Date())
}

export async function getPlanForMonth(monthYear: string) {
  const prisma = await getPrisma()
  return prisma.allocationPlan.findFirst({ where: { monthYear }, orderBy: { generatedAt: 'desc' } })
}
