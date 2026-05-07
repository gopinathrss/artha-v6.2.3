import type { AllocationRow } from './allocationRowTypes'
import { ensureRowType } from './allocationRowTypes'

export const ALLOCATION_PLAN_SCHEMA_VERSION = 'v1' as const

const ROW_TYPES = new Set(['BUY', 'SELL', 'HOLD', 'RESERVE'])

function isDecimalLike(v: unknown): v is number | string {
  return typeof v === 'number' || typeof v === 'string'
}

function assertDecimalLike(v: unknown, path: string): void {
  if (!isDecimalLike(v)) throw new Error(`${path}: amountCzk must be number or string`)
}

function assertString(v: unknown, path: string, min = 1): void {
  if (typeof v !== 'string' || v.length < min) throw new Error(`${path}: invalid string`)
}

/** Validates one allocation row object (strict, for writes). */
export function assertValidAllocationRow(row: unknown, index: number): void {
  const p = `allocations[${index}]`
  if (!row || typeof row !== 'object') throw new Error(`${p}: must be object`)
  const o = row as Record<string, unknown>
  const t = o.type
  if (typeof t !== 'string' || !ROW_TYPES.has(t)) throw new Error(`${p}.type: invalid type ${String(t)}`)
  assertDecimalLike(o.amountCzk, `${p}.amountCzk`)
  assertString(o.reason, `${p}.reason`, 1)

  if (t === 'BUY') {
    /* destination / isin optional */
  } else if (t === 'SELL') {
    if (o.taxImpactCzk != null) assertDecimalLike(o.taxImpactCzk, `${p}.taxImpactCzk`)
    if (o.currentValueCzk != null) assertDecimalLike(o.currentValueCzk, `${p}.currentValueCzk`)
  } else if (t === 'HOLD') {
    if (o.currentValueCzk != null) assertDecimalLike(o.currentValueCzk, `${p}.currentValueCzk`)
    if (o.daysToAction != null && typeof o.daysToAction !== 'number') {
      throw new Error(`${p}.daysToAction: must be number or null`)
    }
  } else if (t === 'RESERVE') {
    /* optional destination */
  }
}

/** Strict parse for writes (throws on failure). */
export function parseAllocationsJsonStrict(json: unknown): AllocationRow[] {
  if (json != null && typeof json === 'object' && !Array.isArray(json) && 'rows' in (json as object)) {
    const w = json as { schemaVersion?: string; rows?: unknown }
    if (w.schemaVersion === ALLOCATION_PLAN_SCHEMA_VERSION && Array.isArray(w.rows)) {
      for (let i = 0; i < w.rows.length; i++) assertValidAllocationRow(w.rows[i], i)
      return w.rows as AllocationRow[]
    }
  }
  if (!Array.isArray(json)) throw new Error('allocations must be a JSON array or { schemaVersion, rows }')
  for (let i = 0; i < json.length; i++) assertValidAllocationRow(json[i], i)
  return json as AllocationRow[]
}

/** Parse for reads: strict array / wrapped shape first; else legacy coercion per element. */
export function parsePlanAllocations(json: unknown): AllocationRow[] {
  try {
    return parseAllocationsJsonStrict(json)
  } catch {
    if (Array.isArray(json)) {
      return json.map((x) => ensureRowType(x))
    }
    throw new Error('Invalid AllocationPlan.allocations: not an array and not strict-parseable')
  }
}
