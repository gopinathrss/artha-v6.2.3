import { getPrisma } from '../prisma'
import { num } from '../money'
import { fireAlertWithDedup } from '../alerts/dedup'

export async function runCapProximityCheck(): Promise<{ checked: number; alerted: number }> {
  const prisma = await getPrisma()
  const strategies = await prisma.fundStrategy.findMany({
    where: { status: { in: ['APPROVED', 'MONITORING'] } as never },
    include: { holding: { select: { currentValueCzk: true, name: true } } }
  })

  let alerted = 0
  for (const s of strategies) {
    const currentCzk = num((s as any).holding?.currentValueCzk as never)
    const capCzk = num((s as any).profitCapCzk as never)
    const capPct = num((s as any).profitCapPct as never)
    const costBasisApprox = num((s as any).absoluteCapCzk as never)
    const gainPct = costBasisApprox > 0 ? ((currentCzk - costBasisApprox) / costBasisApprox) * 100 : 0

    const czkProx = capCzk > 0 ? currentCzk / capCzk : 0
    const pctProx = capPct > 0 ? gainPct / capPct : 0
    const approaching = czkProx >= 0.9 || pctProx >= 0.9
    if (!approaching) continue

    const whichCap = czkProx >= pctProx ? 'CZK' : 'PCT'
    const proximityPct = Math.round(Math.max(czkProx, pctProx) * 100)

    await fireAlertWithDedup({
      alertKey: `profit-cap:${(s as any).holdingId}`,
      severity: 'LOW',
      category: 'PROFIT_CAP_APPROACH',
      title: `${String((s as any).holding?.name || 'Holding')} approaching profit cap`,
      message:
        `Position at ~${proximityPct}% of ${whichCap} profit cap. Current: ${Math.round(currentCzk).toLocaleString('cs-CZ')} Kč, cap: ${Math.round(
          capCzk
        ).toLocaleString('cs-CZ')} Kč.`,
      metadata: { strategyId: (s as any).id, proximityPct, whichCap } as object
    }).catch(() => {})
    alerted += 1
  }

  return { checked: strategies.length, alerted }
}

