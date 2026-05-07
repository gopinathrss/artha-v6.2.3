import type { PrismaClient } from '@prisma/client'
import { d, num } from '../money'
import { costBasisCzk } from '../sellEngine/taxFreeExit'
import { getMergedSettings } from '../appSettingsMerge'
import type { HoldingSnapshot, SellDecision, SignalContext, SignalEvaluation } from './types'
import { evaluateTaxSignal } from './signals/taxSignal'
import { evaluateAllocationSignal } from './signals/allocationSignal'
import { evaluateProfitCapSignal } from './signals/profitCapSignal'
import { evaluateDrawdownSignal } from './signals/drawdownSignal'

function strengthRank(s: SellDecision['overallStrength']): number {
  return s === 'STRONG_SELL' ? 5 : s === 'SOFT_SELL' ? 4 : s === 'REVIEW' ? 3 : s === 'WARNING' ? 2 : 1
}

export function combineSellSignals(args: {
  holdingId: string
  strategyId: string
  snapshot: HoldingSnapshot
  signals: SignalEvaluation[]
}): SellDecision {
  const { holdingId, strategyId, snapshot, signals } = args
  const fired = signals.filter((s) => s.fired)

  const byType = new Map(fired.map((s) => [s.signalType, s]))
  const dd = byType.get('DRAWDOWN')
  const tx = byType.get('TAX')

  let overall: SellDecision['overallStrength'] = 'HOLD'
  let primary: SellDecision['primarySignal'] = 'NONE'

  if (dd && dd.strength === 'STRONG_SELL') {
    overall = 'STRONG_SELL'
    primary = 'DRAWDOWN'
  } else if (tx && tx.strength === 'STRONG_SELL') {
    overall = 'STRONG_SELL'
    primary = 'TAX'
  } else if (fired.some((s) => s.strength === 'SOFT_SELL')) {
    overall = 'SOFT_SELL'
    // Prefer PROFIT_CAP when present, else TAX, else others.
    primary = byType.has('PROFIT_CAP') ? 'PROFIT_CAP' : byType.has('TAX') ? 'TAX' : byType.has('ALLOCATION') ? 'ALLOCATION' : 'NONE'
  } else if (fired.some((s) => s.strength === 'REVIEW')) {
    overall = 'REVIEW'
    primary = byType.has('TAX') ? 'TAX' : byType.has('ALLOCATION') ? 'ALLOCATION' : byType.has('PROFIT_CAP') ? 'PROFIT_CAP' : 'NONE'
  } else if (fired.some((s) => s.strength === 'WARNING')) {
    overall = 'WARNING'
    primary = fired[0]?.signalType ?? 'NONE'
  }

  const recommendedAction: SellDecision['recommendedAction'] =
    overall === 'STRONG_SELL'
      ? 'SELL_NOW'
      : overall === 'SOFT_SELL'
        ? 'PLAN_SELL'
        : overall === 'REVIEW'
          ? 'REVIEW'
          : overall === 'WARNING'
            ? 'WATCH'
            : 'HOLD'

  const urgencyDays =
    overall === 'STRONG_SELL' ? 7 : overall === 'SOFT_SELL' ? 30 : overall === 'REVIEW' ? 14 : null

  const shouldNotify = overall === 'STRONG_SELL' || overall === 'SOFT_SELL'

  // Rough CZ tax estimate (15% on gains) when not tax-free.
  const gainCzk = snapshot.currentValueCzk - snapshot.costBasisCzk
  const estimatedTaxCzk =
    snapshot.isTaxFree ? 0 : gainCzk > 0 ? Math.round(gainCzk * 0.15) : 0

  const lines: string[] = []
  for (const s of signals) {
    if (!s.fired) continue
    const cc =
      s.crossChecks && s.crossChecks.length
        ? ' Cross-checks: ' +
          s.crossChecks
            .map((c) => `${c.name}=${c.result}${c.note ? `(${c.note})` : ''}`)
            .join('; ')
        : ''
    lines.push(`${s.signalType}: ${s.strength} — ${s.reasoning}.${cc}`.trim())
  }
  if (lines.length === 0) lines.push('No sell signals fired.')

  lines.push(`Combined: ${overall} (primary: ${primary}). Recommended: ${recommendedAction}.`)
  if (!snapshot.isTaxFree && estimatedTaxCzk > 0) {
    lines.push(`Estimated tax if sold now: ${estimatedTaxCzk.toLocaleString('cs-CZ')} Kč.`)
  }

  return {
    holdingId,
    strategyId,
    overallStrength: overall,
    primarySignal: primary,
    signals,
    reasoning: lines.join(' '),
    recommendedAction,
    urgencyDays,
    estimatedTaxCzk: estimatedTaxCzk ?? null,
    shouldNotify
  }
}

function daysUntil(dte: Date | null): number | null {
  if (!dte) return null
  const ms = dte.getTime() - Date.now()
  return Math.round(ms / 86400000)
}

async function peerAverageCagrPct(prisma: PrismaClient, category: string): Promise<number | null> {
  const cat = String(category || '').toUpperCase()
  // Best-effort: cap the IN list size to avoid huge queries.
  const peers = await prisma.instrumentLibrary
    .findMany({
      where: { category: cat },
      select: { isin: true },
      take: 200
    })
    .catch(() => [])
  const isins = peers.map((p) => p.isin).filter(Boolean)
  if (isins.length === 0) return null

  const agg = await prisma.historicalNavStats
    .aggregate({
      where: { isin: { in: isins } },
      _avg: { cagr5y: true }
    })
    .catch(() => null)
  const v = agg?._avg?.cagr5y
  if (v == null) return null
  const n = num(v as never)
  return Number.isFinite(n) ? n : null
}

async function computePeakValueCzk(prisma: PrismaClient, isin: string, units: number, currentValueCzk: number) {
  // Conservative degrade: if we cannot get historical series, assume peak = current (drawdown=0).
  try {
    const best = await prisma.historicalNavSummary.findFirst({
      where: { isin },
      orderBy: { nav: 'desc' },
      select: { nav: true }
    })
    if (!best?.nav) return currentValueCzk
    const nav = num(best.nav as never)
    if (!Number.isFinite(nav) || nav <= 0) return currentValueCzk
    const peak = nav * units
    return peak > 0 ? peak : currentValueCzk
  } catch {
    return currentValueCzk
  }
}

export async function evaluateSellDecision(holdingId: string, prisma: PrismaClient): Promise<SellDecision> {
  const strategy = await prisma.fundStrategy.findFirst({
    where: { holdingId, status: { in: ['APPROVED', 'MONITORING'] } as never },
    orderBy: { proposedAt: 'desc' }
  })
  if (!strategy) throw new Error('No approved strategy for holdingId')

  const holding = await prisma.holding.findUnique({
    where: { id: holdingId },
    include: { cashflows: true }
  })
  if (!holding) throw new Error('Holding not found')

  const merged = await getMergedSettings(prisma).catch(() => null)

  const costBasis = costBasisCzk({ cashflows: holding.cashflows as any })
  const currentValueCzk = num(holding.currentValueCzk as never)
  const units = num(holding.units as never)

  const peakValueCzk = await computePeakValueCzk(prisma, holding.isin, units, currentValueCzk)
  const gainPct = costBasis > 0 ? ((currentValueCzk - costBasis) / costBasis) * 100 : 0
  const drawdownFromPeak = peakValueCzk > 0 ? ((peakValueCzk - currentValueCzk) / peakValueCzk) * 100 : 0

  const latestSnap = await prisma.snapshot.findFirst({ orderBy: { date: 'desc' } }).catch(() => null)
  const totalPortfolioCzk = latestSnap?.netWorthCzk != null ? num(latestSnap.netWorthCzk as never) : 0
  const currentAllocationPct = totalPortfolioCzk > 0 ? (currentValueCzk / totalPortfolioCzk) * 100 : 0

  const taxFreeDate = holding.taxFreeDate ?? null
  const dtu = daysUntil(taxFreeDate)
  const isTaxFree = dtu != null ? dtu <= 0 : false

  const stats = await prisma.historicalNavStats
    .findFirst({ where: { isin: holding.isin }, orderBy: { computedAt: 'desc' } })
    .catch(() => null)
  const backtestStats = stats
    ? {
        cagrPct5yr: stats.cagr5y != null ? num(stats.cagr5y as never) : null,
        maxDrawdownPct: stats.maxDrawdownAll != null ? num(stats.maxDrawdownAll as never) : null,
        sharpeRatio: stats.sharpe3y != null ? num(stats.sharpe3y as never) : null,
        recoveryMonths: stats.recoveryMonths ?? null
      }
    : null

  const peerAvg = await peerAverageCagrPct(prisma, holding.category)

  const snapshot: HoldingSnapshot = {
    holdingId,
    isin: holding.isin,
    name: holding.name,
    currentValueCzk,
    costBasisCzk: costBasis,
    peakValueCzk,
    gainPct,
    drawdownFromPeak,
    currentAllocationPct,
    taxFreeDate,
    daysUntilTaxFree: dtu,
    isTaxFree,
    category: holding.category
  }

  const allHoldingsByCategory: Record<string, number> = {}
  try {
    const all = await prisma.holding.findMany({
      where: { status: { in: ['ACTIVE', 'INACTIVE'] } },
      select: { category: true, currentValueCzk: true }
    })
    for (const h of all) {
      const k = String(h.category || '').toUpperCase()
      allHoldingsByCategory[k] = (allHoldingsByCategory[k] ?? 0) + num(h.currentValueCzk as never)
    }
  } catch {
    /* */
  }

  const ctx: SignalContext = {
    totalPortfolioCzk,
    allHoldingsByCategory,
    riskProfile: merged?.riskProfile || 'MODERATE',
    backtestStats,
    peerAverageCagrPct: peerAvg,
    // Best-effort sleeve hints for the tax cross-check (without re-running allocation math).
    targetSleevePct:
      holding.category === 'BONDS'
        ? merged?.targetBondsPct ?? null
        : holding.category === 'CASH'
          ? merged?.targetCashPct ?? null
          : merged?.targetEquityPct ?? null,
    currentSleevePct: null
  }

  const tax = evaluateTaxSignal(snapshot, strategy as any, ctx)
  const alloc = evaluateAllocationSignal(snapshot, strategy as any, ctx)
  const profit = evaluateProfitCapSignal(snapshot, strategy as any, ctx)
  const dd = evaluateDrawdownSignal(snapshot, strategy as any, ctx)

  const decision = combineSellSignals({
    holdingId,
    strategyId: strategy.id,
    snapshot,
    signals: [tax, alloc, profit, dd]
  })

  // Profit cap adjustment write-back (cap moves up only).
  if (profit.meta && profit.meta.adjustCaps === true) {
    const newCapPct = Number(profit.meta.newCapPct)
    const newCapCzk = Number(profit.meta.newCapCzk)
    if (Number.isFinite(newCapPct) && Number.isFinite(newCapCzk)) {
      const oldCzk = num((strategy as any).profitCapCzk as never)
      // Only move up.
      if (newCapCzk > oldCzk) {
        await prisma.fundStrategy.update({
          where: { id: strategy.id },
          data: {
            profitCapPct: d(newCapPct) as never,
            profitCapCzk: d(newCapCzk) as never,
            profitCapAdjustedAt: new Date(),
            profitCapAdjustedFrom: d(oldCzk) as never
          }
        })
      }
    }
  }

  return decision
}

function mapSignalType(s: SignalEvaluation): any {
  if (s.signalType === 'TAX') return 'TAX_WINDOW_REACHED'
  if (s.signalType === 'ALLOCATION') return 'ALLOCATION_DRIFT'
  if (s.signalType === 'PROFIT_CAP') {
    const trig = (s.meta && (s.meta.capTrigger as string)) || ''
    if (trig === 'PCT') return 'PROFIT_CAP_PCT'
    if (trig === 'CZK') return 'PROFIT_CAP_CZK'
    return 'PROFIT_CAP_APPROACH'
  }
  if (s.signalType === 'DRAWDOWN') return s.strength === 'WARNING' ? 'DRAWDOWN_WARNING' : 'DRAWDOWN_RISK'
  return 'REVIEW_DATE'
}

export async function writeSignalToDb(
  decision: SellDecision,
  snapshot: HoldingSnapshot,
  prisma: PrismaClient
): Promise<void> {
  // Persist fired signals; snapshot metrics are embedded in each signal reasoning/cross-checks.
  for (const s of decision.signals) {
    if (!s.fired) continue
    // Idempotency guard: skip if we fired the same signal recently.
    // (Prevents double-run cron from spamming duplicates.)
    const cutoff = new Date(Date.now() - 20 * 3600000)
    const last = await prisma.strategySignal.findFirst({
      where: {
        strategyId: decision.strategyId,
        holdingId: decision.holdingId,
        signalType: mapSignalType(s) as never,
        strength: s.strength as never,
        firedAt: { gte: cutoff }
      },
      orderBy: { firedAt: 'desc' },
      select: { id: true }
    })
    if (last) continue
    await prisma.strategySignal.create({
      data: {
        strategyId: decision.strategyId,
        holdingId: decision.holdingId,
        signalType: mapSignalType(s) as never,
        strength: s.strength as never,
        currentValueCzk: d(snapshot.currentValueCzk) as never,
        costBasisCzk: d(snapshot.costBasisCzk) as never,
        gainPct: d(snapshot.gainPct) as never,
        drawdownPct: d(snapshot.drawdownFromPeak) as never,
        allocationPct: d(snapshot.currentAllocationPct) as never,
        reasoning: s.reasoning,
        crossCheckResults: (s.crossChecks || []) as never
      }
    })
  }
}

export async function evaluateAllApprovedStrategies(prisma: PrismaClient): Promise<
  { holdingId: string; decision: SellDecision | null; error?: string }[]
> {
  const list = await prisma.fundStrategy.findMany({
    where: { status: { in: ['APPROVED', 'MONITORING'] } as never },
    select: { holdingId: true }
  })

  const out: Array<{ holdingId: string; decision: SellDecision | null; error?: string }> = []
  for (const row of list) {
    try {
      const decision = await evaluateSellDecision(row.holdingId, prisma)
      // Recompute snapshot for persistence: evaluateSellDecision already computed it internally;
      // for simplicity, recompute minimal snapshot here (no external calls beyond holding + snapshot).
      const holding = await prisma.holding.findUnique({ where: { id: row.holdingId }, include: { cashflows: true } })
      const latestSnap = await prisma.snapshot.findFirst({ orderBy: { date: 'desc' } }).catch(() => null)
      const totalPortfolioCzk = latestSnap?.netWorthCzk != null ? num(latestSnap.netWorthCzk as never) : 0
      if (holding) {
        const costBasisCzk2 = costBasisCzk({ cashflows: holding.cashflows as any })
        const currentValueCzk2 = num(holding.currentValueCzk as never)
        const peakValueCzk2 = currentValueCzk2
        const gainPct2 = costBasisCzk2 > 0 ? ((currentValueCzk2 - costBasisCzk2) / costBasisCzk2) * 100 : 0
        const drawdownFromPeak2 = 0
        const currentAllocationPct2 = totalPortfolioCzk > 0 ? (currentValueCzk2 / totalPortfolioCzk) * 100 : 0
        const tf = holding.taxFreeDate ?? null
        const dtu = daysUntil(tf)
        const snapshot: HoldingSnapshot = {
          holdingId: row.holdingId,
          isin: holding.isin,
          name: holding.name,
          currentValueCzk: currentValueCzk2,
          costBasisCzk: costBasisCzk2,
          peakValueCzk: peakValueCzk2,
          gainPct: gainPct2,
          drawdownFromPeak: drawdownFromPeak2,
          currentAllocationPct: currentAllocationPct2,
          taxFreeDate: tf,
          daysUntilTaxFree: dtu,
          isTaxFree: dtu != null ? dtu <= 0 : false,
          category: holding.category
        }
        await writeSignalToDb(decision, snapshot, prisma)
      }
      out.push({ holdingId: row.holdingId, decision })
    } catch (e) {
      out.push({ holdingId: row.holdingId, decision: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

