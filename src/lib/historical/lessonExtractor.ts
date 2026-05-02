import { realPrisma as prisma } from '../prismaProvider'
import { getPatternsByTags } from '../patterns/loader'

export interface Lesson {
  isin: string
  fundName: string
  cagr5y: number | null
  maxDrawdown5y: number | null
  recoveryMonths: number | null
  sharpe3y: number | null
  narrative: string
  patternIds: string[]
}

export async function extractLesson(
  isin: string,
  context: { fundName: string; planId?: string; rowKey?: string }
): Promise<Lesson | null> {
  const stats = await prisma.historicalNavStats.findUnique({ where: { isin } })
  if (!stats || stats.dataPointCount < 30) return null

  const cagr5y = stats.cagr5y != null ? Number(stats.cagr5y) : null
  const maxDD5y = stats.maxDrawdown5y != null ? Number(stats.maxDrawdown5y) : null
  const recovery = stats.recoveryMonths
  const sharpe = stats.sharpe3y != null ? Number(stats.sharpe3y) : null

  const parts: string[] = []
  const tags: string[] = []

  if (cagr5y != null && Number.isFinite(cagr5y)) {
    parts.push(`5-year CAGR: ${cagr5y.toFixed(1)}%`)
    if (cagr5y > 12) tags.push('allocation')
    if (cagr5y < 4) tags.push('bonds')
  }
  if (maxDD5y != null && Number.isFinite(maxDD5y)) {
    parts.push(`max drawdown ${maxDD5y.toFixed(1)}% in last 5 years`)
    if (maxDD5y > 30) tags.push('behavioral', 'volatility')
    if (recovery != null) parts.push(`recovered in ${recovery} months`)
  }
  if (sharpe != null && Number.isFinite(sharpe)) {
    parts.push(`Sharpe ratio ${sharpe.toFixed(2)}`)
  }

  const patterns = getPatternsByTags(tags.length ? tags : ['allocation'], 2)
  const patternIds = patterns.map((p) => p.id)

  let narrative = `${context.fundName}: ${parts.join(', ')}.`
  if (patterns.length > 0) {
    narrative += ` Per [${patterns[0]!.id}], ${patterns[0]!.title.toLowerCase()}.`
  }

  await prisma.backtestLesson.create({
    data: {
      isin,
      fundName: context.fundName,
      asOfDate: stats.asOfDate,
      cagr5y: stats.cagr5y,
      maxDrawdown5y: stats.maxDrawdown5y,
      recoveryMonths: recovery,
      sharpe3y: stats.sharpe3y,
      narrative,
      linkedPlanId: context.planId ?? null,
      linkedRowKey: context.rowKey ?? null,
      patternIds
    }
  })

  return {
    isin,
    fundName: context.fundName,
    cagr5y,
    maxDrawdown5y: maxDD5y,
    recoveryMonths: recovery,
    sharpe3y: sharpe,
    narrative,
    patternIds
  }
}
