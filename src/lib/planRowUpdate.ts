import { getPrisma } from './prisma'
import { ensureRowType } from './allocationRowTypes'
import { parsePlanAllocations } from './allocationPlanSchema'
import { readPlanAllocationsForMutation } from './planAllocationsRead'
import { replacePlanRows, type PlanRowClient } from './allocationPlanRows'

/** Same behaviour as PATCH /api/this-month/plan/:planId/row/:rowIndex action=DONE */
export async function markPlanRowDone(
  planId: string,
  rowIndex: number,
  opts?: {
    executedAmountCzk?: number
    executedAt?: string
    navAtExecution?: number
    source?: 'DASHBOARD' | 'TELEGRAM'
  }
): Promise<void> {
  const prisma = await getPrisma()
  const src = opts?.source || 'DASHBOARD'
  const note = src === 'TELEGRAM' ? 'From Telegram /done' : 'From allocation plan row'
  const plan = await prisma.allocationPlan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan not found')
  const parsed = await readPlanAllocationsForMutation(plan)
  if (rowIndex >= parsed.length) throw new Error('Invalid row')
  const all = plan.allocations as unknown
  if (!Array.isArray(all)) throw new Error('Invalid row')

  const next = all.map((x) => (typeof x === 'object' && x !== null ? { ...(x as object) } : x)) as Record<
    string,
    unknown
  >[]

  const baseRow = { ...(next[rowIndex] as Record<string, unknown>) }
  const executedAmountCzk = Number(
    opts?.executedAmountCzk != null ? opts.executedAmountCzk : (baseRow.amountCzk as number) || 0
  )
  const executedAt = opts?.executedAt
    ? new Date(opts.executedAt).toISOString()
    : new Date().toISOString()
  next[rowIndex] = {
    ...baseRow,
    executionStatus: 'DONE',
    executedAt,
    executedAmountCzk,
    skipReason: null
  }
  const r = next[rowIndex] as Record<string, unknown>
  const typed = ensureRowType(r)
  const isSell = typed.type === 'SELL'
  const isin = r.isin != null ? String(r.isin) : ''
  const rowKey = typeof r.rowKey === 'string' && r.rowKey.length > 0 ? r.rowKey : null
  const fundLabel = isSell ? String(r.source || 'Fund') : String(r.destination || 'Fund')
  await prisma.$transaction(async (tx) => {
    if (isin) {
      await tx.sipExecution.create({
        data: {
          planId,
          planRowKey: rowKey,
          scheduledDate: new Date(),
          executedDate: new Date(executedAt),
          isin,
          fundName: fundLabel,
          side: isSell ? 'SELL' : 'BUY',
          amountCzk: executedAmountCzk,
          currency: String(r.currency || 'CZK'),
          status: 'EXECUTED',
          notes: note,
          navAtExecution:
            opts?.navAtExecution != null && Number.isFinite(opts.navAtExecution) ? opts.navAtExecution : null,
          unitsAcquired: null,
          amountLocal: null,
          confirmationMethod: src
        }
      })
    }
    await tx.advisorJournal.create({
      data: {
        category: 'FOLLOWED',
        content: isSell
          ? `Sold ${executedAmountCzk} CZK from ${fundLabel} (plan row ${rowIndex})`
          : `Executed ${executedAmountCzk} CZK to ${fundLabel}`,
        relatedIsin: isin || null,
        impactCzk: executedAmountCzk,
        metadata: { planId, rowIndex, action: 'DONE', source: src } as object
      }
    })
    await tx.allocationPlan.update({
      where: { id: planId },
      data: { allocations: next as object }
    })
    await replacePlanRows(tx as unknown as PlanRowClient, planId, parsePlanAllocations(next))
  })
}
