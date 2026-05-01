import type { SellRow } from '../allocationRowTypes'
import { getPrisma } from '../prisma'
import { num } from '../money'
import { convertCurrency } from '../currency'
import { getBestNREFDRate } from '../indiaIntelligence'

function tenorLabel(fd: { startDate: Date; maturityDate: Date }): string {
  const ms = new Date(fd.maturityDate).getTime() - new Date(fd.startDate).getTime()
  const y = ms / (365.25 * 86400000)
  if (y >= 2.5) return '3yr'
  if (y >= 1.5) return '2yr'
  return '1yr'
}

export async function detectFdMaturityActions(): Promise<SellRow[]> {
  const prisma = await getPrisma()
  const fds = await prisma.indiaFixedDeposit.findMany({
    where: { autoRenew: false }
  })

  const today = new Date()
  const rows: SellRow[] = []

  for (const fd of fds) {
    const daysToMaturity = Math.floor((new Date(fd.maturityDate).getTime() - today.getTime()) / 86400000)
    if (daysToMaturity < 0 || daysToMaturity > 30) continue

    const tenor = tenorLabel(fd)
    const best = await getBestNREFDRate(tenor)
    const bestBank = best?.bankName ?? '—'
    const bestPct = best?.value != null ? num(best.value) : 0
    const principalInr = num(fd.principalInr)
    let principalCzk = 0
    try {
      principalCzk = await convertCurrency(principalInr, 'INR', 'CZK')
    } catch {
      principalCzk = Math.round(principalInr * 0.28)
    }

    rows.push({
      type: 'SELL',
      source: `${fd.bank} ${fd.accountType} FD`,
      isin: `FD-${fd.id}`,
      sellSubtype: 'FD_MATURITY',
      amountCzk: Math.round(principalCzk),
      taxImpactCzk: 0,
      currentValueCzk: Math.round(principalCzk),
      reason:
        `${fd.bank} ${fd.accountType} FD matures in ${daysToMaturity} days. ` +
        `Principal ₹${principalInr.toFixed(0)} (~${principalCzk.toFixed(0)} CZK). ` +
        `Best current rate: ${bestBank} ${bestPct.toFixed(2)}% for ${tenor}. ` +
        `Renew or redirect — confirm decision.`,
      executionStatus: 'PENDING',
      currency: 'CZK'
    })
  }

  return rows
}
