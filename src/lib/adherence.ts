import { prisma } from './prisma'

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
  return {
    months: labels.length,
    totalRows,
    doneRows,
    skippedRows,
    pendingRows,
    adherencePct
  }
}
