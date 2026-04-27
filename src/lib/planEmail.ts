import type { AllocationPlan } from '@prisma/client'

export function buildPlanReadyEmail(plan: AllocationPlan, baseUrl?: string): string {
  const all = (plan.allocations as unknown) as { destination?: string; amountCzk?: number }[] | null
  const lines = Array.isArray(all)
    ? all
        .map((a) => `${(a.destination || '—').replace(/</g, '')}: ${Math.round(a.amountCzk || 0)} Kč`)
        .join('<br/>')
    : '—'
  const root = (baseUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const link = root ? `${root}/this-month` : '/this-month'
  return `<h2 style="font-family:Georgia,serif">Your ${plan.monthYear} plan is ready</h2>
<p>Investable: <strong>${Math.round(plan.investableCzk || 0)}</strong> Kč</p>
<p>${lines}</p>
<p><a href="${link}">Open This month in ARTHA</a></p>`

}
