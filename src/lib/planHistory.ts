import { getPrisma } from './prisma'
import { num } from './money'
import { isAdherenceRow } from './allocationRowTypes'

export type MonthPlanOutcome = {
  monthYear: string
  planId: string | null
  status: string | null
  generatedAt: string | null
  planSource: string | null
  investableCzk: number | null
  totalRows: number
  doneRows: number
  skippedRows: number
  pendingRows: number
  /** done / (done+skipped) × 100, or 0 if no closable rows */
  adherencePct: number
  hasPlan: boolean
}

function lastNMonthYearLabels(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

type Row = { executionStatus?: string }

function countRows(arr: unknown): { total: number; done: number; skipped: number; pending: number } {
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

/** Last N calendar months (including current), newest first in the array. */
export async function getMonthlyPlanOutcomes(months: number): Promise<MonthPlanOutcome[]> {
  const prisma = await getPrisma()
  const n = Math.max(1, Math.min(24, months))
  const labels = lastNMonthYearLabels(n)
  const out: MonthPlanOutcome[] = []
  for (const monthYear of labels) {
    const plan = await prisma.allocationPlan.findFirst({
      where: { monthYear },
      orderBy: { generatedAt: 'desc' }
    })
    if (!plan) {
      out.push({
        monthYear,
        planId: null,
        status: null,
        generatedAt: null,
        planSource: null,
        investableCzk: null,
        totalRows: 0,
        doneRows: 0,
        skippedRows: 0,
        pendingRows: 0,
        adherencePct: 0,
        hasPlan: false
      })
      continue
    }
    const c = countRows(plan.allocations as unknown)
    const den = c.done + c.skipped
    const adherencePct = den > 0 ? Math.round((c.done / den) * 1000) / 10 : 0
    out.push({
      monthYear,
      planId: plan.id,
      status: plan.status,
      generatedAt: plan.generatedAt.toISOString(),
      planSource: plan.planSource,
      investableCzk: plan.investableCzk == null ? null : num(plan.investableCzk),
      totalRows: c.total,
      doneRows: c.done,
      skippedRows: c.skipped,
      pendingRows: c.pending,
      adherencePct,
      hasPlan: true
    })
  }
  return out
}
