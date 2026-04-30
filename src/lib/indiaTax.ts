/**
 * India mutual fund / debt tax **labels** for UI (not legal advice).
 * EQUITY: >365d → LTCG; <365d → STCG countdown. ELSS: 3y lock. Debt: slab (simplified post-2023).
 */
export type IndiaMfTaxBadge = { label: string; tone: 'green' | 'amber' | 'slate' | 'red' }

/**
 * Simplified equity LTCG on listed equity MF / shares (not tax advice).
 * Annual exemption ₹1.25L; tax 12.5% on gains above exemption (post-Apr-2024 regime sketch).
 */
export function equityLtcgTaxInr(gainInr: number, exemptionInr = 125_000, rate = 0.125): number {
  const g = Math.max(0, gainInr)
  const taxable = Math.max(0, g - exemptionInr)
  return Math.round(taxable * rate)
}

export function indiaMfTaxBadge(input: { category: string; purchaseDate: Date; now?: Date }): IndiaMfTaxBadge {
  const now = input.now || new Date()
  const cat = (input.category || 'EQUITY').toUpperCase()
  if (cat.includes('ELSS')) {
    const lockEnd = new Date(input.purchaseDate)
    lockEnd.setFullYear(lockEnd.getFullYear() + 3)
    const left = Math.max(0, Math.ceil((lockEnd.getTime() - now.getTime()) / 86400000))
    if (left > 0) return { label: `Locked ${left}d`, tone: 'red' }
  }
  if (cat.includes('DEBT') || cat.includes('BOND') || cat === 'CASH' || cat.includes('GILT')) {
    return { label: 'Slab rate', tone: 'slate' }
  }
  const daysHeld = (now.getTime() - input.purchaseDate.getTime()) / 86400000
  if (daysHeld >= 365) return { label: 'LTCG eligible', tone: 'green' }
  const d = Math.max(0, Math.ceil(365 - daysHeld))
  return { label: `STCG (${d}d to LTCG)`, tone: 'amber' }
}
