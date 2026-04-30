export type AllocationRowType = 'BUY' | 'SELL' | 'HOLD' | 'RESERVE'

export interface AllocationRowBase {
  type: AllocationRowType
  amountCzk: number
  reason: string
  executionStatus: 'PENDING' | 'DONE' | 'SKIPPED'
  executedAt?: string
  executedAmountCzk?: number
  skipReason?: string
  rowKey?: string
  currency?: string
}

export interface BuyRow extends AllocationRowBase {
  type: 'BUY'
  destination: string
  isin?: string
}

export interface SellRow extends AllocationRowBase {
  type: 'SELL'
  source: string
  isin: string
  sellSubtype: 'TAX_FREE_EXIT' | 'REBALANCE_DRIFT' | 'FD_MATURITY'
  taxImpactCzk: number
  currentValueCzk: number
  unitsToSell?: number
}

export interface HoldRow extends AllocationRowBase {
  type: 'HOLD'
  isin: string
  currentValueCzk: number
  holdReason: 'AT_TARGET' | 'TAX_WINDOW_NEAR' | 'TAX_WINDOW_HOLD' | 'INSUFFICIENT_DATA'
  daysToAction?: number
}

export interface ReserveRow extends AllocationRowBase {
  type: 'RESERVE'
  destination: string
  eventId?: string
}

export type AllocationRow = BuyRow | SellRow | HoldRow | ReserveRow

export type PlanAllocation = AllocationRow

export function ensureRowType(row: unknown): AllocationRow {
  if (!row || typeof row !== 'object') {
    return {
      type: 'BUY',
      destination: '',
      amountCzk: 0,
      reason: '',
      rowKey: 'r0',
      executionStatus: 'PENDING',
      currency: 'CZK'
    }
  }
  const o = row as Record<string, unknown>
  if (!o.type) {
    return {
      ...o,
      type: 'BUY',
      destination: String(o.destination ?? ''),
      amountCzk: Number(o.amountCzk ?? 0),
      reason: String(o.reason ?? ''),
      rowKey: String(o.rowKey ?? 'r0'),
      executionStatus: (o.executionStatus as BuyRow['executionStatus']) || 'PENDING',
      currency: String(o.currency ?? 'CZK'),
      isin: o.isin != null ? String(o.isin) : undefined
    } as BuyRow
  }
  return row as AllocationRow
}

export function isAdherenceRow(raw: unknown): boolean {
  const t = (raw as { type?: string })?.type
  if (t === 'HOLD') return false
  return true
}
