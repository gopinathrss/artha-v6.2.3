import { prisma } from './prisma'
import { isAdherenceRow } from './allocationRowTypes'

function lastNMonthYearLabels(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

type Row = {
  executionStatus?: string
}

function countRowStates(arr: unknown): { total: number; done: number; skipped: number; pending: number } {
  let total = 0
  let done = 0
  let skipped = 0
  let pending = 0
  if (!Array.isArray(arr)) {
    return { total: 0, done: 0, skipped: 0, pending: 0 }
  }
  for (const raw of arr) {
    if (!isAdherenceRow(raw)) continue
    const row = raw as Row
    const st = (row.executionStatus || 'PENDING').toUpperCase()
    total += 1
    if (st === 'DONE') done += 1
    else if (st === 'SKIPPED') skipped += 1
    else pending += 1
  }
  return { total, done, skipped, pending }
}

/** Consecutive months (newest first) with a plan, ≥1 row, 0 pending. */
export async function computeOnTrackStreakMax(): Promise<number> {
  const labels = lastNMonthYearLabels(36)
  let streak = 0
  for (const my of labels) {
    const plan = await prisma.allocationPlan.findFirst({
      where: { monthYear: my },
      orderBy: { generatedAt: 'desc' }
    })
    if (!plan) break
    const c = countRowStates(plan.allocations as unknown)
    if (c.total < 1) break
    if (c.pending > 0) break
    streak += 1
  }
  return streak
}

function rollingSinceMonthsAgo(months: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function sumFollowThroughCzk(since: Date): Promise<number> {
  const rows = await prisma.sipExecution.findMany({
    where: { executedDate: { gte: since } },
    select: { amountCzk: true }
  })
  let s = 0
  for (const r of rows) {
    s += Number(r.amountCzk) || 0
  }
  return Math.round(s * 100) / 100
}

export async function computeAdherenceStats(months: number) {
  const labels = lastNMonthYearLabels(Math.max(1, Math.min(24, months)))
  let totalRows = 0
  let doneRows = 0
  let skippedRows = 0
  let pendingRows = 0

  for (const my of labels) {
    const plan = await prisma.allocationPlan.findFirst({
      where: { monthYear: my },
      orderBy: { generatedAt: 'desc' }
    })
    if (!plan) continue
    const arr = plan.allocations as unknown
    if (!Array.isArray(arr)) continue
    for (const raw of arr) {
      if (!isAdherenceRow(raw)) continue
      const row = raw as Row
      const st = (row.executionStatus || 'PENDING').toUpperCase()
      totalRows += 1
      if (st === 'DONE') doneRows += 1
      else if (st === 'SKIPPED') skippedRows += 1
      else pendingRows += 1
    }
  }

  const den = doneRows + skippedRows
  const adherencePct = den > 0 ? Math.round((doneRows / den) * 1000) / 10 : 0
  const [onTrackStreakMonths, followThroughCzk6m] = await Promise.all([
    computeOnTrackStreakMax(),
    sumFollowThroughCzk(rollingSinceMonthsAgo(6))
  ])
  return {
    months: labels.length,
    totalRows,
    doneRows,
    skippedRows,
    pendingRows,
    adherencePct,
    onTrackStreakMonths,
    followThroughCzk6m
  }
}
