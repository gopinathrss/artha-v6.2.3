import { getPrisma } from '../prisma'
import { evaluateAllApprovedStrategies } from '../intelligence/sellDecisionEngine'
import { fireAlertWithDedup } from '../alerts/dedup'

function severityFor(overall: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (overall === 'STRONG_SELL') return 'HIGH'
  if (overall === 'SOFT_SELL') return 'MEDIUM'
  return 'LOW'
}

export async function runDailyStrategyEvaluation(): Promise<{ evaluated: number; fired: number; errors: number }> {
  const prisma = await getPrisma()
  const results = await evaluateAllApprovedStrategies(prisma)

  const fired = results.filter((r) => r.decision?.shouldNotify)
  const errors = results.filter((r) => r.error)

  try {
    await prisma.systemHealth.create({
      data: {
        checkName: 'STRATEGY_EVALUATOR',
        status: errors.length > 0 ? 'WARN' : 'PASS',
        message: `Evaluated ${results.length} strategies. ${fired.length} signal(s) fired.${errors.length ? ` ${errors.length} error(s).` : ''}`,
        metadata: {
          evaluated: results.length,
          signalsFired: fired.length,
          errors: errors.map((e) => ({ holdingId: e.holdingId, error: e.error }))
        } as object
      }
    })
  } catch {
    /* do not break cron */
  }

  for (const r of fired) {
    const d = r.decision
    if (!d) continue
    const sev = severityFor(d.overallStrength)
    await fireAlertWithDedup({
      alertKey: `strategy:${r.holdingId}`,
      severity: sev,
      category: 'STRATEGY_SIGNAL',
      title: `${d.overallStrength}: ${d.recommendedAction}`,
      message: d.reasoning,
      metadata: {
        holdingId: r.holdingId,
        strategyId: d.strategyId,
        primarySignal: d.primarySignal,
        urgencyDays: d.urgencyDays
      }
    }).catch(() => {})
  }

  return { evaluated: results.length, fired: fired.length, errors: errors.length }
}

