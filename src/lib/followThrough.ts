import type { AllocationPlan } from '@prisma/client'
import { getPrisma } from './prisma'
import { ensureRowType, isAdherenceRow } from './allocationRowTypes'

type AllocRow = Record<string, unknown>

/**
 * Mark every PENDING allocation row as DONE (suggested amount, same date),
 * with SipExecution + Advisor journal per row with ISIN, matching single-row PATCH behavior.
 */
export async function markAllPendingRowsDone(planId: string, opts?: { executedAt?: string }): Promise<AllocationPlan> {
  const prisma = await getPrisma()
  const plan = await prisma.allocationPlan.findUnique({ where: { id: planId } })
  if (!plan) {
    throw new Error('Plan not found')
  }
  const all = plan.allocations as unknown
  if (!Array.isArray(all)) {
    throw new Error('Invalid allocations')
  }
  const next = all.map((x) => (typeof x === 'object' && x !== null ? { ...(x as object) } : x)) as AllocRow[]
  const executedAtIso = opts?.executedAt
    ? new Date(opts.executedAt).toISOString()
    : new Date().toISOString()
  const pendingIndices: number[] = []
  for (let i = 0; i < next.length; i++) {
    if (!isAdherenceRow(next[i])) continue
    const st = String((next[i].executionStatus as string) || 'PENDING').toUpperCase()
    if (st === 'PENDING') pendingIndices.push(i)
  }
  if (pendingIndices.length === 0) {
    return plan
  }

  for (const rowIndex of pendingIndices) {
    const baseRow = { ...(next[rowIndex] as AllocRow) }
    const executedAmountCzk = Number(baseRow.amountCzk != null ? baseRow.amountCzk : 0) || 0
    next[rowIndex] = {
      ...baseRow,
      executionStatus: 'DONE',
      executedAt: executedAtIso,
      executedAmountCzk,
      skipReason: null
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const rowIndex of pendingIndices) {
      const r = next[rowIndex] as AllocRow
      const executedAmountCzk = Number(r.executedAmountCzk != null ? r.executedAmountCzk : r.amountCzk) || 0
      const typed = ensureRowType(r)
      const isin = r.isin != null ? String(r.isin) : ''
      const isSell = typed.type === 'SELL'
      const fundLabel = isSell ? String((r as { source?: string }).source || 'Fund') : String(r.destination || 'Fund')
      const rowKey =
        typeof r.rowKey === 'string' && r.rowKey.length > 0 ? String(r.rowKey) : null
      if (isin) {
        await tx.sipExecution.create({
          data: {
            planId,
            planRowKey: rowKey,
            scheduledDate: new Date(),
            executedDate: new Date(executedAtIso),
            isin,
            fundName: fundLabel,
            side: isSell ? 'SELL' : 'BUY',
            amountCzk: executedAmountCzk,
            currency: String(r.currency || 'CZK'),
            status: 'EXECUTED',
            notes: 'Mark all done (bulk follow-through)',
            navAtExecution: null,
            unitsAcquired: null,
            amountLocal: null,
            confirmationMethod: 'DASHBOARD'
          }
        })
      }
      await tx.advisorJournal.create({
        data: {
          category: 'FOLLOWED',
          content: isSell
            ? `Bulk: sold ${executedAmountCzk} CZK from ${fundLabel}`
            : `Bulk: executed ${executedAmountCzk} CZK to ${fundLabel}`,
          relatedIsin: isin || null,
          impactCzk: executedAmountCzk,
          metadata: { planId, rowIndex, action: 'DONE', bulk: true } as object
        }
      })
    }
    await tx.allocationPlan.update({
      where: { id: planId },
      data: { allocations: next as object }
    })
  })

  const updated = await prisma.allocationPlan.findUnique({ where: { id: planId } })
  if (!updated) throw new Error('Plan not found after update')
  return updated
}

export function countPendingInPlan(allocations: unknown): number {
  if (!Array.isArray(allocations)) return 0
  let n = 0
  for (const raw of allocations) {
    if (!isAdherenceRow(raw)) continue
    const row = raw as { executionStatus?: string }
    const st = (row.executionStatus || 'PENDING').toUpperCase()
    if (st === 'PENDING') n += 1
  }
  return n
}
