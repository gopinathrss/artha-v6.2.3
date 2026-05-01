import { getPrisma, realPrisma } from './prisma'
import { currentMonthYear, generateMonthlyPlan } from './allocationPlanner'

export type OnboardingCompleteBody = {
  profile: {
    fullName: string
    dateOfBirth: string
    taxResidency: string
    homeCurrency: string
    monthlyNetIncomeCzk: number
    salaryDayOfMonth: number
    riskProfile: string
    retirementAge: number
    retirementMonthlyExpense: number
    emergencyFundTarget: number
    targetEquityPct: number
    targetBondsPct: number
    targetCashPct: number
  }
  expenses: Array<{
    category: string
    description: string
    amountCzk: number
    dueDayOfMonth: number | null
    frequency?: string
  }>
  events: Array<{
    eventDate: string
    title: string
    category: string
    budgetCzk: number
  }>
}

/**
 * Persists profile, income, expenses, events, marks onboarding complete, then ensures a plan for the current month.
 */
export async function runOnboardingCompleteFlow(body: OnboardingCompleteBody): Promise<{ planId: string }> {
  const p = body.profile
  const start = new Date()
  start.setDate(1)
  start.setHours(12, 0, 0, 0)

  let s = await realPrisma.settings.findFirst()
  if (!s) s = await realPrisma.settings.create({ data: {} })
  await realPrisma.settings.update({
    where: { id: s.id },
    data: {
      onboardingComplete: true,
      targetEquityPct: p.targetEquityPct,
      targetBondsPct: p.targetBondsPct,
      targetCashPct: p.targetCashPct
    }
  })

  const prisma = await getPrisma()
  await prisma.$transaction(async (tx) => {
    const risk = (p.riskProfile || 'MODERATE').toUpperCase()
    const riskDb = risk === 'CONSERVATIVE' || risk === 'GROWTH' || risk === 'MODERATE' ? risk : 'MODERATE'

    await tx.userProfile.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        fullName: p.fullName,
        dateOfBirth: new Date(p.dateOfBirth),
        homeCurrency: p.homeCurrency || 'CZK',
        taxResidency: p.taxResidency || 'CZ',
        riskProfile: riskDb,
        monthlyNetIncomeCzk: p.monthlyNetIncomeCzk,
        salaryDayOfMonth: Math.min(31, Math.max(1, Math.floor(p.salaryDayOfMonth))),
        emergencyFundTarget: p.emergencyFundTarget,
        retirementAge: Math.floor(p.retirementAge),
        retirementMonthlyExpense: p.retirementMonthlyExpense
      },
      update: {
        fullName: p.fullName,
        dateOfBirth: new Date(p.dateOfBirth),
        homeCurrency: p.homeCurrency || 'CZK',
        taxResidency: p.taxResidency || 'CZ',
        riskProfile: riskDb,
        monthlyNetIncomeCzk: p.monthlyNetIncomeCzk,
        salaryDayOfMonth: Math.min(31, Math.max(1, Math.floor(p.salaryDayOfMonth))),
        emergencyFundTarget: p.emergencyFundTarget,
        retirementAge: Math.floor(p.retirementAge),
        retirementMonthlyExpense: p.retirementMonthlyExpense
      }
    })

    await tx.incomeEvent.create({
      data: {
        date: start,
        source: 'SALARY',
        amountLocal: p.monthlyNetIncomeCzk,
        currency: 'CZK',
        amountCzk: p.monthlyNetIncomeCzk,
        recurring: true,
        notes: 'Onboarding'
      }
    })

    for (const e of body.expenses) {
      await tx.expenseCommitment.create({
        data: {
          category: e.category,
          description: e.description,
          amountCzk: e.amountCzk,
          frequency: e.frequency || 'MONTHLY',
          dueDayOfMonth: e.dueDayOfMonth,
          startDate: start,
          active: true
        }
      })
    }

    for (const ev of body.events) {
      await tx.upcomingEvent.create({
        data: {
          eventDate: new Date(ev.eventDate),
          title: ev.title,
          category: ev.category,
          budgetCzk: ev.budgetCzk,
          reservedCzk: 0,
          status: 'UPCOMING'
        }
      })
    }
  })

  const my = currentMonthYear()
  const existing = await prisma.allocationPlan.findFirst({
    where: { monthYear: my, status: { in: ['PROPOSED', 'CONFIRMED'] } },
    orderBy: { generatedAt: 'desc' }
  })
  if (existing) return { planId: existing.id }

  const plan = await generateMonthlyPlan(my, 'MANUAL')
  return { planId: plan.id }
}
