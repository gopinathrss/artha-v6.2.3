import type { PrismaClient } from '@prisma/client'
import { num } from '../money'

function decishToNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const s = (v as { toString?: () => string }).toString?.()
  if (typeof s === 'string') {
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export type StrategyMapValue = {
  strategyId: string
  monthlySipCzk: number
  absoluteCapCzk: number
  monthsToTarget: number
  currentMonth: number
  isCapReached: boolean
  profitCapPct: number
  profitCapCzk: number
  allocationSleeve: string
  confidence: string
  reviewDate: Date
}

export type StrategyMap = Map<string, StrategyMapValue>

export async function loadApprovedStrategies(prisma: PrismaClient): Promise<StrategyMap> {
  const strategies = await prisma.fundStrategy.findMany({
    where: { status: { in: ['APPROVED', 'MONITORING'] } as never },
    include: {
      holding: { select: { id: true, currentValueCzk: true } }
    }
  })

  const map: StrategyMap = new Map()
  for (const s of strategies) {
    const currentValueCzk = decishToNumber((s as any).holding?.currentValueCzk)
    const absoluteCapCzk = decishToNumber((s as any).absoluteCapCzk)
    const approvedAt = (s as any).approvedAt ?? (s as any).createdAt
    const monthsSinceApproval = Math.floor((Date.now() - new Date(approvedAt).getTime()) / (1000 * 60 * 60 * 24 * 30.4))
    map.set((s as any).holdingId, {
      strategyId: (s as any).id,
      monthlySipCzk: decishToNumber((s as any).monthlySipCzk),
      absoluteCapCzk,
      monthsToTarget: Number((s as any).monthsToTarget) || 0,
      currentMonth: monthsSinceApproval + 1,
      isCapReached: currentValueCzk >= absoluteCapCzk && absoluteCapCzk > 0,
      profitCapPct: decishToNumber((s as any).profitCapPct),
      profitCapCzk: decishToNumber((s as any).profitCapCzk),
      allocationSleeve: String((s as any).allocationSleve || ''),
      confidence: String((s as any).confidence || ''),
      reviewDate: new Date((s as any).reviewDate)
    })
  }
  return map
}

