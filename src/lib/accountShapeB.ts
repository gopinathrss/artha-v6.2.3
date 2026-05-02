import { Prisma } from '@prisma/client'
import type { Account } from '@prisma/client'
import { d, type MoneyInput } from './money'

/**
 * Shape B invariant at write time:
 * - CZK: balanceCzkSnapshot is required and must equal balanceLocal.
 * - Non-CZK: balanceCzkSnapshot must be null (no persisted CZK book).
 */
export function assertAccountShapeBInvariant(
  currency: string,
  balanceLocal: MoneyInput,
  balanceCzkSnapshot: MoneyInput | null | undefined
): void {
  const cur = (currency || 'CZK').toUpperCase().trim()
  const local = d(balanceLocal)
  if (cur === 'CZK') {
    const snap = balanceCzkSnapshot != null ? d(balanceCzkSnapshot) : local
    if (!snap.eq(local)) {
      throw new Error('Shape B: for CZK accounts balanceCzkSnapshot must equal balanceLocal')
    }
    return
  }
  if (balanceCzkSnapshot != null && !d(balanceCzkSnapshot).isZero()) {
    throw new Error('Shape B: balanceCzkSnapshot must be null for non-CZK accounts')
  }
}

/** Returns Prisma-ready snapshot for create/update after validating client input. */
export function balanceCzkSnapshotForWrite(
  currency: string,
  balanceLocal: MoneyInput,
  clientSnapshot: MoneyInput | null | undefined
): Prisma.Decimal | null {
  const cur = (currency || 'CZK').toUpperCase().trim()
  const local = d(balanceLocal)
  assertAccountShapeBInvariant(cur, local, clientSnapshot)
  return cur === 'CZK' ? local : null
}

export function mergedAccountShapeB(
  prev: Account,
  patch: Record<string, unknown>
): { currency: string; balanceLocal: Prisma.Decimal; balanceCzkSnapshot: Prisma.Decimal | null } {
  const currency = String(patch.currency ?? prev.currency)
  const balanceLocal = patch.balanceLocal !== undefined ? d(patch.balanceLocal as MoneyInput) : d(prev.balanceLocal)
  const snapInPatch = Object.prototype.hasOwnProperty.call(patch, 'balanceCzkSnapshot')
  const clientSnap = snapInPatch ? (patch.balanceCzkSnapshot as MoneyInput | null) : (prev.balanceCzkSnapshot as MoneyInput | null)
  const snapshot = balanceCzkSnapshotForWrite(currency, balanceLocal, clientSnap)
  return { currency, balanceLocal, balanceCzkSnapshot: snapshot }
}
