import type { SellRow } from '../allocationRowTypes'
import { getPrisma } from '../prisma'
import { num, type MoneyInput } from '../money'

export const CZECH_TAX_FREE_DAYS = 1095

export function costBasisCzk(holding: { cashflows?: { amountCzk: unknown; type: string }[] }): number {
  const flows = holding.cashflows || []
  let s = 0
  for (const c of flows) {
    const t = (c.type || '').toUpperCase()
    if (t !== 'SIP' && t !== 'LUMP_SUM') continue
    const a = num(c.amountCzk as MoneyInput)
    s += Math.abs(a)
  }
  return s
}

/**
 * Czech holdings past the 3-year tax-free window: recommend full exit (tax-free gain).
 * Does not emit before 1095 days from purchase (defer / rebalance use tax calendar elsewhere).
 */
export async function detectTaxFreeExitOpportunities(): Promise<SellRow[]> {
  const prisma = await getPrisma()
  const holdings = await prisma.holding.findMany({
    where: { status: { in: ['ACTIVE', 'INACTIVE'] }, country: 'CZ' },
    include: { cashflows: true }
  })
  const today = new Date()
  const rows: SellRow[] = []

  for (const h of holdings) {
    const purchaseDate = new Date(h.purchaseStartDate)
    const ageMs = today.getTime() - purchaseDate.getTime()
    const ageDays = Math.floor(ageMs / 86400000)
    if (ageDays < CZECH_TAX_FREE_DAYS) continue

    const currentValueCzk = num(h.currentValueCzk)
    const invested = costBasisCzk(h)
    const gainCzk = invested > 0 ? currentValueCzk - invested : currentValueCzk
    const daysSinceFree = ageDays - CZECH_TAX_FREE_DAYS

    rows.push({
      type: 'SELL',
      source: h.name,
      isin: h.isin,
      sellSubtype: 'TAX_FREE_EXIT',
      amountCzk: currentValueCzk,
      taxImpactCzk: 0,
      currentValueCzk,
      reason:
        `Held ${ageDays} days (${daysSinceFree}d past tax-free). ` +
        `Gain ~${gainCzk.toFixed(0)} CZK is now tax-exempt (3y Czech fund rule). ` +
        `Realize and redeploy to maintain target allocation.`,
      executionStatus: 'PENDING',
      currency: 'CZK'
    })
  }

  return rows
}
