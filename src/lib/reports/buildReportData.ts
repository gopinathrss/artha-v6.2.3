import type { UserProfile } from '@prisma/client'
import { getPrisma } from '../prisma'
import { getPortfolioSummary } from '../portfolio'
import { buildMonthlyPlanPayload, currentMonthYear, getPlanForMonth, nextMonthYearString } from '../allocationPlanner'
import { computeAdherenceStats } from '../adherence'
import { loadAllLibrary, findBestAlternative, compareFundToETF } from '../instrumentLibrary'
import { calculateTaxStatus } from '../calculations'
import { indiaMfTaxBadge } from '../indiaTax'
import { num } from '../money'
import { accountToCzk } from '../accountToCzk'
import { ensureRowType } from '../allocationRowTypes'
import { readPlanAllocationsOrEmpty } from '../planAllocationsRead'

export type ReportAudience = 'INTERNAL' | 'CLIENT'

export type PremiumReportData = {
  version: 3
  theme?: { gold: string }
  type: string
  audience: ReportAudience
  monthYear: string
  periodLabel: string
  generatedAtIso: string
  cover: {
    titleLine: string
    netWorthCzk: number
    momCzk: number
    momPct: number
    momLabel: string
    periodStartLabel: string
    periodEndLabel: string
    generatedLabel: string
  }
  executive: {
    netWorthCzk: number
    momCzk: number
    momPct: number
    momLabel: string
    adherencePct: number
    xirr: number | null
    allocDriftEquityPp: number
    monthsToFF: number | null
  }
  planVsExecuted: {
    monthYear: string
    rows: Array<{
      destination: string
      planned: number
      executed: number | null
      status: string
      variance: number | null
      skipReason?: string | null
    }>
    skippedNotes: string[]
  }
  charts: {
    trajectory: [number, number][]
    waterfall: { name: string; value: number; isTotal?: boolean }[]
    targetAlloc: { equity: number; bonds: number; cash: number }
    actualAlloc: { equity: number; bonds: number; cash: number }
    goalFan: { t: number[]; p25: number[]; p50: number[]; p75: number[]; p5: number[]; p95: number[] }
  }
  czechHoldings: Array<{
    fund: string
    isin: string
    units: number
    nav: number
    valueCzk: number
    gainCzk: number
    xirr: number | null
    taxFreeDate: string
    taxHighlight: 'ok' | 'near' | 'na'
  }>
  india: {
    nre: { inr: number; czk: number } | null
    nro: { inr: number; czk: number } | null
    mfs: Array<{
      scheme: string
      amc: string | null
      units: number
      nav: number
      valueInr: number
      valueCzk: number
      xirr: number | null
      taxLabel: string
    }>
    fds: Array<{
      bank: string
      principalInr: number
      rate: number
      maturity: string
      daysLeft: number
    }>
  }
  feeAnalysis: {
    rows: Array<{
      yourFund: string
      bestEtf: string
      terDiff: number
      annualSavingCzk: number
    }>
    totalSavingCzk: number
  }
  goals: Array<{
    title: string
    targetCzk: number
    currentCzk: number
    pct: number
    prob: number
    monthsLeft: number | null
  }>
  cashflow: {
    income: number
    fixed: number
    events: number
    investable: number
  }
  journal: Array<{ date: string; category: string; content: string }>
  nextMonth: {
    monthYear: string
    rows: Array<{ destination: string; amountCzk: number; reason: string }>
    caveat: string
  }
}

function escClient(s: string, client: boolean) {
  if (!client) return s
  return s.replace(/./g, (c, i) => (i < 3 ? c : '·'))
}

export async function buildReportData(
  type: string,
  monthYear: string | null | undefined,
  audience: ReportAudience
): Promise<PremiumReportData> {
  const my = monthYear || currentMonthYear()
  const client = audience === 'CLIENT'
  const prisma = await getPrisma()
  const [portfolio, profile, lib, plan, adherence, mfs, fds, accounts, journals] = await Promise.all([
    getPortfolioSummary(),
    prisma.userProfile.findUnique({ where: { id: 'default' } }),
    loadAllLibrary(),
    getPlanForMonth(my),
    computeAdherenceStats(6).catch(() => ({
      adherencePct: 0,
      doneRows: 0,
      skippedRows: 0,
      pendingRows: 0,
      totalRows: 0
    })),
    prisma.indiaMutualFund.findMany({ orderBy: { purchaseDate: 'asc' } }).catch(() => [] as never[]),
    prisma.indiaFixedDeposit.findMany({ orderBy: { maturityDate: 'asc' } }).catch(() => [] as never[]),
    prisma.account.findMany({ where: { isActive: true } }),
    prisma.advisorJournal.findMany({ orderBy: { date: 'desc' }, take: 5 }).catch(() => [])
  ])

  const p = portfolio.success && portfolio.data ? portfolio.data : null
  const settings = p?.settings
  const fxRates = p?.fxRates as { EURCZK?: number; EURINR?: number } | undefined
  const snaps = (p?.snapshots || []).map((s: { date: Date | string; netWorthCzk: unknown }) => ({
    date: s.date,
    netWorthCzk: num(s.netWorthCzk as never)
  }))
  const now = new Date()
  const periodStart = new Date(my + '-01T12:00:00.000Z')
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + 1)
  periodEnd.setDate(0)

  const total = p?.netWorth?.totalCzk ?? 0
  const rawMom = p?.momChange as
    | { czk?: number | null; pct?: number | null; label?: string }
    | undefined
  const mom = rawMom ?? { czk: 0, pct: 0, label: '' }
  const momCzk = mom.czk ?? 0
  const momPct = mom.pct ?? 0
  const momLabel = mom.label ? String(mom.label) : ''
  const xirrV = p?.xirr?.displayValue as number | null

  const traj: [number, number][] = (snaps || [])
    .map((s) => [new Date(s.date).getTime(), Number(s.netWorthCzk) || 0] as [number, number])
    .filter((a) => a[1] > 0)
  if (traj.length === 0) {
    traj.push([Date.now() - 86400000 * 30, total - momCzk] as [number, number])
    traj.push([Date.now(), total] as [number, number])
  }

  const startNw = traj.length > 0 ? traj[0]![1] : total - momCzk
  const gains = total - startNw
  const inv = Number(p?.totalInvested) || 0
  const contrib =
    p?.totalInvested != null && Number.isFinite(inv)
      ? Math.max(0, inv - startNw)
      : gains * 0.3
  const waterfall = [
    { name: 'Start', value: Math.round(startNw) },
    { name: 'Contributions', value: Math.round(contrib) },
    { name: 'Market / gains', value: Math.round(gains - contrib) },
    { name: 'End', value: Math.round(total), isTotal: true }
  ]

  const tEq = num(settings?.targetEquityPct ?? 65)
  const tB = num(settings?.targetBondsPct ?? 25)
  const tC = num(settings?.targetCashPct ?? 10)
  const a = p?.allocation || { equityPct: 0, bondsPct: 0, cashPct: 0, equityGap: 0 }
  const allocDrift = Math.abs(a.equityGap || 0)

  const planRows: PremiumReportData['planVsExecuted']['rows'] = []
  const skippedNotes: string[] = []
  const allocs = plan
    ? ((await readPlanAllocationsOrEmpty(plan)) as unknown as Array<Record<string, unknown>>)
    : []
  for (const row of allocs) {
    const dest = String(row.destination || '—')
    const planned = Number(row.amountCzk) || 0
    const st = String((row.executionStatus as string) || 'PENDING').toUpperCase()
    const ex = row.executedAmountCzk != null ? Number(row.executedAmountCzk) : null
    const var_ =
      st === 'DONE' && ex != null
        ? ex - planned
        : st === 'PENDING' || st === 'SKIPPED'
          ? 0 - planned
          : null
    if (st === 'SKIPPED' && row.skipReason) skippedNotes.push(`${dest}: ${String(row.skipReason)}`)
    planRows.push({
      destination: client ? `Row ${planRows.length + 1}` : dest,
      planned: planned,
      executed: st === 'DONE' ? ex : st === 'SKIPPED' ? 0 : null,
      status: st,
      variance: var_,
      skipReason: (row.skipReason as string) || null
    })
  }

  const holdCzech = (p?.holdings || []).filter(
    (h: { country?: string }) => String((h as { country?: string }).country || 'CZ').toUpperCase() !== 'IN'
  )
  const czechHoldings: PremiumReportData['czechHoldings'] = holdCzech.slice(0, 24).map((h: Record<string, unknown>) => {
      const t = calculateTaxStatus(h, now)
      const days = t?.daysUntilTaxFree
      const th: 'ok' | 'near' | 'na' = days == null ? 'na' : days <= 0 ? 'ok' : days < 90 ? 'near' : 'na'
      return {
        fund: client ? 'Czech position' : String(h.name || h.isin || '—'),
        isin: client ? '—' : String(h.isin || '—'),
        units: num(h.units as never) || 0,
        nav: num(h.nav as never) || 0,
        valueCzk: num(h.currentValueCzk as never) || 0,
        gainCzk: 0,
        xirr: xirrV,
        taxFreeDate: t?.taxFreeDate ? new Date(t.taxFreeDate).toLocaleDateString('en-GB') : '—',
        taxHighlight: th
      }
    })

  const nreA = accounts.find((x) => x.type === 'NRE')
  const nroA = accounts.find((x) => x.type === 'NRO')
  const eurczk = fxRates?.EURCZK ?? 25
  const eurinr = fxRates?.EURINR ?? 90
  const inrPerCzk = (eurinr / eurczk) || 1
  const mfsData: PremiumReportData['india']['mfs'] = (mfs as Array<{
    schemeName: string
    amc: string | null
    units: number
    currentNavInr: number | null
    purchaseDate: Date
    category: string
  }>).map((m) => {
    const nav = num(m.currentNavInr ?? 0)
    const vinr = num(m.units) * nav
    const badge = indiaMfTaxBadge({ category: m.category, purchaseDate: new Date(m.purchaseDate) })
    return {
      scheme: escClient(m.schemeName, client),
      amc: m.amc,
      units: num(m.units),
      nav: nav,
      valueInr: Math.round(vinr),
      valueCzk: Math.round(vinr / inrPerCzk),
      xirr: null,
      taxLabel: badge.label
    }
  })

  const nowT = now.getTime()
  const fdsData: PremiumReportData['india']['fds'] = (fds as Array<{
    bank: string
    principalInr: number
    interestRatePct: number
    maturityDate: Date
  }>).map((f) => ({
    bank: f.bank,
    principalInr: num(f.principalInr),
    rate: num(f.interestRatePct),
    maturity: new Date(f.maturityDate).toLocaleDateString('en-GB'),
    daysLeft: Math.max(0, Math.ceil((new Date(f.maturityDate).getTime() - nowT) / 86400000))
  }))

  const feeRows: PremiumReportData['feeAnalysis']['rows'] = []
  let totSave = 0
  const holdList = (p?.holdings || []) as Array<Record<string, unknown>>
  const libFx = {
    EURCZK: p?.fxRates?.EURCZK ?? 25,
    EURINR: p?.fxRates?.EURINR ?? 90
  }
  for (const h of holdList) {
    const best = findBestAlternative(h as never, lib)
    if (best) {
      const c = compareFundToETF(h as never, best.instrument, libFx, lib)
      totSave += c.annualSavingCzk
      feeRows.push({
        yourFund: client ? 'Holding' : String(h.name),
        bestEtf: c.alternative.name,
        terDiff: c.feeDiffPct,
        annualSavingCzk: c.annualSavingCzk
      })
    }
  }

  const prof = profile as UserProfile | null
  const blended = (a.equityPct / 100) * 13 + (a.bondsPct / 100) * 6.5 + (a.cashPct / 100) * 5
  const horizonY = prof?.retirementAge
    ? Math.max(0, prof.retirementAge - (new Date().getFullYear() - 1990))
    : 15
  const targetW =
    settings?.targetWealthCzk != null && settings.targetWealthCzk !== undefined
      ? num(settings.targetWealthCzk)
      : null
  const monthsToFF =
    prof && targetW != null && targetW > 0
      ? Math.max(
          0,
          Math.round(
            Math.log((targetW || 1) / Math.max(1, total)) / Math.log(1 + (blended / 100) / 12)
          )
        )
      : null
  const confN = typeof p?.confidence === 'number' ? p.confidence : 70
  const goalRow: PremiumReportData['goals'] = [
    {
      title: 'Target wealth (settings)',
      targetCzk: targetW || 0,
      currentCzk: total,
      pct: targetW && targetW > 0 ? Math.min(100, (total / targetW) * 100) : 0,
      prob: confN,
      monthsLeft: monthsToFF
    }
  ]

  const tHorizon = 12
  const p50: number[] = []
  const p25: number[] = []
  const p75: number[] = []
  const p5: number[] = []
  const p95: number[] = []
  const tArr: number[] = []
  const mRet = Math.pow(1 + (blended || 7) / 100, 1 / 12) - 1
  for (let i = 0; i <= tHorizon; i++) {
    tArr.push(i)
    const base = total * Math.pow(1 + mRet, i * 2)
    const wobble = 0.04 * base
    p50.push(Math.round(base))
    p25.push(Math.round(base - wobble * 0.5))
    p75.push(Math.round(base + wobble * 0.5))
    p5.push(Math.round(base - wobble * 2.2))
    p95.push(Math.round(base + wobble * 2.2))
  }

  let nextPayload = {
    monthYear: nextMonthYearString(),
    rows: [] as Array<{ destination: string; amountCzk: number; reason: string }>
  }
  try {
    const pre = await buildMonthlyPlanPayload(nextMonthYearString())
    nextPayload = {
      monthYear: pre.monthYear,
      rows: pre.allocations.map((raw) => {
        const r = ensureRowType(raw)
        const destination =
          r.type === 'SELL' ? r.source : r.type === 'HOLD' ? r.isin : (r as { destination?: string }).destination ?? ''
        return { destination, amountCzk: r.amountCzk, reason: r.reason }
      })
    }
  } catch {
    nextPayload.rows = []
  }

  const cashflow = {
    income: num(plan?.totalAvailableCzk ?? 0),
    fixed: num(plan?.fixedExpensesCzk ?? 0),
    events: num(plan?.reservedEventsCzk ?? 0),
    investable: num(plan?.investableCzk ?? 0)
  }

  const jRows = (journals as Array<{ date: Date; category: string; content: string }>).map((j) => ({
    date: new Date(j.date).toLocaleString('en-GB'),
    category: j.category,
    content: j.content.length > 500 ? j.content.slice(0, 497) + '…' : j.content
  }))

  const adh = Math.round((adherence as { adherencePct?: number }).adherencePct ?? 0)
  const gen = new Date()
  const cet = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'short' })
    .format(gen)

  return {
    version: 3,
    theme: { gold: '#B8922A' },
    type: type || 'CFO_10',
    audience,
    monthYear: my,
    periodLabel: my,
    generatedAtIso: gen.toISOString(),
    cover: {
      titleLine: `PIE — Monthly Report — ${my}`,
      netWorthCzk: total,
      momCzk,
      momPct,
      momLabel,
      periodStartLabel: periodStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      periodEndLabel: periodEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      generatedLabel: `Generated ${cet} CET`
    },
    executive: {
      netWorthCzk: total,
      momCzk,
      momPct,
      momLabel,
      adherencePct: adh,
      xirr: xirrV,
      allocDriftEquityPp: allocDrift,
      monthsToFF: monthsToFF
    },
    planVsExecuted: {
      monthYear: my,
      rows: planRows,
      skippedNotes
    },
    charts: {
      trajectory: traj,
      waterfall,
      targetAlloc: { equity: tEq, bonds: tB, cash: tC },
      actualAlloc: {
        equity: a.equityPct,
        bonds: a.bondsPct,
        cash: a.cashPct
      },
      goalFan: { t: tArr, p25, p50, p75, p5, p95 }
    },
    czechHoldings,
    india: {
      nre: nreA
        ? {
            inr: num(nreA.balanceLocal),
            czk: num(
              accountToCzk(
                { balanceLocal: nreA.balanceLocal, currency: nreA.currency || 'INR' },
                { EURCZK: eurczk, EURINR: eurinr }
              )
            )
          }
        : null,
      nro: nroA
        ? {
            inr: num(nroA.balanceLocal),
            czk: num(
              accountToCzk(
                { balanceLocal: nroA.balanceLocal, currency: nroA.currency || 'INR' },
                { EURCZK: eurczk, EURINR: eurinr }
              )
            )
          }
        : null,
      mfs: mfsData,
      fds: fdsData
    },
    feeAnalysis: {
      rows: feeRows,
      totalSavingCzk: totSave
    },
    goals: goalRow,
    cashflow,
    journal: jRows,
    nextMonth: {
      monthYear: nextPayload.monthYear,
      rows: nextPayload.rows,
      caveat: 'Subject to FX rates, NAVs, and salary day.'
    }
  }
}
