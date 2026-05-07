import { Prisma } from '@prisma/client'
import type { AllocationRow, BuyRow, HoldRow, ReserveRow, SellRow } from './allocationRowTypes'
import { num } from './money'

/** Prisma client / transaction delegate for `AllocationPlanRow` (generated after `prisma generate`). */
export type PlanRowClient = {
  allocationPlanRow: {
    deleteMany: (args: { where: { planId: string } }) => Promise<unknown>
    createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>
    updateMany: (args: {
      where: { planId: string; orderIndex: number }
      data: { executionStatus: string; executedAt?: Date | null }
    }) => Promise<unknown>
  }
}

function dec(v: number | string | null | undefined): Prisma.Decimal | null {
  if (v == null) return null
  return new Prisma.Decimal(typeof v === 'number' && !Number.isFinite(v) ? 0 : String(v))
}

function decReq(v: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof v === 'number' && !Number.isFinite(v) ? 0 : String(v))
}

/** Map persisted allocation rows to Prisma createMany payloads (dual-write). */
export function allocationRowsToCreateManyData(
  planId: string,
  rows: AllocationRow[]
): Record<string, unknown>[] {
  return rows.map((row, orderIndex) => {
    const base: Record<string, unknown> = {
      planId,
      orderIndex,
      type: row.type,
      amountCzk: decReq(row.amountCzk as never),
      reason: row.reason,
      executionStatus: row.executionStatus || 'PENDING',
      executedAt: row.executedAt ? new Date(row.executedAt) : null
    }

    if (row.type === 'BUY') {
      const b = row as BuyRow
      base.isin = b.isin ?? null
      base.destination = b.destination ?? null
      return base
    }
    if (row.type === 'SELL') {
      const s = row as SellRow
      base.isin = s.isin ?? null
      base.source = s.source ?? null
      base.sellSubtype = s.sellSubtype ?? null
      base.taxImpactCzk = dec(s.taxImpactCzk)
      base.currentValueCzk = dec(s.currentValueCzk)
      return base
    }
    if (row.type === 'HOLD') {
      const h = row as HoldRow
      base.isin = h.isin ?? null
      base.currentValueCzk = dec(h.currentValueCzk)
      base.holdReason = h.holdReason ?? null
      base.daysToAction = h.daysToAction ?? null
      return base
    }
    const r = row as ReserveRow
    base.destination = r.destination ?? null
    return base
  })
}

export async function replacePlanRows(tx: PlanRowClient, planId: string, rows: AllocationRow[]): Promise<void> {
  await tx.allocationPlanRow.deleteMany({ where: { planId } })
  const data = allocationRowsToCreateManyData(planId, rows)
  if (data.length > 0) {
    await tx.allocationPlanRow.createMany({ data })
  }
}

export async function updatePlanRowExecutionStatus(
  tx: PlanRowClient,
  planId: string,
  orderIndex: number,
  patch: {
    executionStatus: string
    executedAt?: Date | null
  }
): Promise<void> {
  await tx.allocationPlanRow.updateMany({
    where: { planId, orderIndex },
    data: {
      executionStatus: patch.executionStatus,
      executedAt: patch.executedAt ?? null
    }
  })
}

export function rowAmountEqualsDb(a: AllocationRow, amountCzk: { toString(): string }): boolean {
  return num(amountCzk as never) === num(a.amountCzk as never)
}
