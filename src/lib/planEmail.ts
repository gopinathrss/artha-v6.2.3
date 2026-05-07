import type { AllocationPlan } from '@prisma/client'
import { num } from './money'
import { readPlanAllocationsOrEmpty } from './planAllocationsRead'

export async function buildPlanReadyEmail(plan: AllocationPlan, baseUrl?: string): Promise<string> {
  const rows = await readPlanAllocationsOrEmpty(plan)
  const lines =
    rows.length > 0
      ? rows
          .map((a) => {
            const dest =
              a.type === 'SELL'
                ? (a as { source?: string }).source
                : a.type === 'HOLD'
                  ? (a as { isin?: string }).isin
                  : (a as { destination?: string }).destination
            return `${String(dest || '—').replace(/</g, '')}: ${Math.round(Number(a.amountCzk) || 0)} Kč`
          })
          .join('<br/>')
      : '—'
  const root = (baseUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const link = root ? `${root}/this-month` : '/this-month'
  return `<h2 style="font-family:Georgia,serif">Your ${plan.monthYear} plan is ready</h2>
<p>Investable: <strong>${Math.round(num(plan.investableCzk) || 0)}</strong> Kč</p>
<p>${lines}</p>
<p><a href="${link}">Open This month in PIE</a></p>`

}
