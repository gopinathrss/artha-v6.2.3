import type { Application, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { getDemoFinances } from '../lib/demoData'
import { createReport, renderReportViewHtml } from '../lib/reportsService'
import { HEALTH_CHECK_COUNT, runHealthChecks } from '../lib/health'
import { currentMonthYear, generateMonthlyPlan, getPlanForMonth } from '../lib/allocationPlanner'
import { sendEmail } from '../lib/emailService'
import { buildPlanReadyEmail } from '../lib/planEmail'
import { computeAdherenceStats } from '../lib/adherence'
import { getMonthlyPlanOutcomes } from '../lib/planHistory'
import { countPendingInPlan, markAllPendingRowsDone } from '../lib/followThrough'
import { markPlanRowDone } from '../lib/planRowUpdate'
import { num } from '../lib/money'

/** Request JSON uses `currentNav` / `avgNav`; DB columns are `currentNavInr` / `avgNavInr`. */
function indiaMfNavFromBody(b: Record<string, unknown>): {
  avgNavInr: number | null
  currentNavInr: number | null
} {
  const avgRaw = b.avgNavInr ?? b.avgNav
  const curRaw = b.currentNavInr ?? b.currentNav
  return {
    avgNavInr: avgRaw != null && avgRaw !== '' ? Number(avgRaw) : null,
    currentNavInr: curRaw != null && curRaw !== '' ? Number(curRaw) : null
  }
}

/** Add API-friendly NAV aliases alongside Prisma `*Inr` fields. */
function indiaMfWithApiNavFields<T extends { currentNavInr: unknown; avgNavInr: unknown }>(row: T) {
  return {
    ...row,
    currentNav: row.currentNavInr != null ? num(row.currentNavInr as never) : null,
    avgNav: row.avgNavInr != null ? num(row.avgNavInr as never) : null
  }
}

async function demoState(): Promise<{ demo: boolean; persona: string }> {
  const s = await prisma.settings.findFirst()
  return { demo: s?.demoModeEnabled ?? false, persona: s?.demoPersona ?? 'engineer' }
}

const defaultProfileCreate = () => ({
  id: 'default',
  fullName: 'User',
  dateOfBirth: new Date('1990-01-01'),
  homeCurrency: 'CZK',
  taxResidency: 'CZ',
  riskProfile: 'MODERATE' as const,
  monthlyNetIncomeCzk: 0,
  salaryDayOfMonth: 15,
  emergencyFundTarget: 120_000,
  retirementAge: 50,
  retirementMonthlyExpense: 30_000
})

export function registerCfoRoutes(app: Application) {
  app.get('/api/setup-status', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({
        success: true,
        data: { showBanner: false, onboardingComplete: true, demo: true }
      })
    }
    let s = await prisma.settings.findFirst()
    if (!s) s = await prisma.settings.create({ data: {} })
    const complete = s.onboardingComplete === true
    return res.json({
      success: true,
      data: { showBanner: !complete, onboardingComplete: complete }
    })
  })

  app.post('/api/onboarding/complete', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.status(403).json({ success: false, error: 'Finish setup in live mode (turn off demo).' })
    }
    let s = await prisma.settings.findFirst()
    if (!s) s = await prisma.settings.create({ data: {} })
    await prisma.settings.update({ where: { id: s.id }, data: { onboardingComplete: true } })
    return res.json({ success: true })
  })

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const h = await runHealthChecks()
      res.json({
        success: true,
        data: {
          ...h,
          expectedCheckCount: HEALTH_CHECK_COUNT,
          checkCount: h.checks.length
        }
      })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Health check failed'
      res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/api/profile', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { profile: getDemoFinances().profile }, demo: true })
    }
    const p = await prisma.userProfile.findUnique({ where: { id: 'default' } })
    return res.json({ success: true, data: { profile: p } })
  })

  app.get('/api/profile/status', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({
        success: true,
        data: { hasProfile: true, hasIncome: true, needsOnboarding: false },
        demo: true
      })
    }
    const hasProfile = !!(await prisma.userProfile.findUnique({ where: { id: 'default' } }))
    const hasIncome = (await prisma.incomeEvent.count()) > 0
    return res.json({
      success: true,
      data: { hasProfile, hasIncome, needsOnboarding: !hasProfile || !hasIncome }
    })
  })

  app.post('/api/profile/onboarding-complete', async (req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.status(403).json({ success: false, error: 'Finish setup in live mode (turn off demo).' })
    }
    try {
      const { runOnboardingCompleteFlow } = await import('../lib/onboardingRun')
      const { planId } = await runOnboardingCompleteFlow(req.body)
      return res.json({ success: true, data: { planId } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Onboarding failed'
      return res.status(400).json({ success: false, error: m })
    }
  })

  const putProfile = async (req: Request, res: Response) => {
    const { demo } = await demoState()
    if (demo) {
      return res.status(403).json({ success: false, error: 'Cannot edit profile in demo mode' })
    }
    const b = req.body as Record<string, unknown>
    const data: Record<string, unknown> = {}
    const copy = (k: string) => {
      if (b[k] !== undefined) data[k] = b[k]
    }
    copy('fullName')
    copy('homeCurrency')
    copy('taxResidency')
    copy('riskProfile')
    copy('monthlyNetIncomeCzk')
    copy('salaryDayOfMonth')
    copy('emergencyFundTarget')
    copy('retirementAge')
    copy('retirementMonthlyExpense')
    copy('notes')
    if (b.dateOfBirth) data.dateOfBirth = new Date(String(b.dateOfBirth))
    const p = await prisma.userProfile.upsert({
      where: { id: 'default' },
      create: { ...defaultProfileCreate(), ...data, id: 'default' },
      update: data as any
    })
    return res.json({ success: true, data: { profile: p } })
  }
  app.put('/api/profile', putProfile)
  app.patch('/api/profile', putProfile)

  app.get('/api/income', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { events: getDemoFinances().income }, demo: true })
    }
    const events = await prisma.incomeEvent.findMany({ orderBy: { date: 'desc' } })
    return res.json({ success: true, data: { events } })
  })

  app.post('/api/income', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const amountCzk = Number(b.amountCzk)
    if (!Number.isFinite(amountCzk)) {
      return res.status(400).json({ success: false, error: 'Invalid amount' })
    }
    const row = await prisma.incomeEvent.create({
      data: {
        date: new Date(b.date),
        source: String(b.source || 'OTHER'),
        amountLocal: Number(b.amountLocal ?? b.amountCzk),
        currency: String(b.currency || 'CZK'),
        amountCzk,
        recurring: Boolean(b.recurring),
        notes: b.notes ?? null
      }
    })
    return res.status(201).json({ success: true, data: { event: row } })
  })

  const putIncome = async (req: Request, res: Response) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.date) d.date = new Date(b.date)
    if (b.amountCzk != null) d.amountCzk = Number(b.amountCzk)
    if (b.amountLocal != null) d.amountLocal = Number(b.amountLocal)
    const u = await prisma.incomeEvent.update({ where: { id: String(req.params.id) }, data: d })
    return res.json({ success: true, data: { event: u } })
  }
  app.put('/api/income/:id', putIncome)
  app.patch('/api/income/:id', putIncome)

  app.delete('/api/income/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    await prisma.incomeEvent.delete({ where: { id: req.params.id } })
    return res.json({ success: true })
  })

  app.get('/api/expenses', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { expenses: getDemoFinances().expenses }, demo: true })
    }
    const expenses = await prisma.expenseCommitment.findMany({ orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: { expenses } })
  })

  app.post('/api/expenses', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const e = await prisma.expenseCommitment.create({
      data: {
        category: String(b.category),
        description: String(b.description || ''),
        amountCzk: Number(b.amountCzk),
        frequency: String(b.frequency || 'MONTHLY'),
        dueDayOfMonth: b.dueDayOfMonth != null ? Number(b.dueDayOfMonth) : null,
        startDate: new Date(b.startDate),
        endDate: b.endDate ? new Date(b.endDate) : null,
        active: b.active !== false,
        notes: b.notes ?? null
      }
    })
    return res.status(201).json({ success: true, data: { expense: e } })
  })

  const putExpense = async (req: Request, res: Response) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.startDate) d.startDate = new Date(b.startDate)
    if (b.endDate) d.endDate = new Date(b.endDate)
    if (b.amountCzk != null) d.amountCzk = Number(b.amountCzk)
    const u = await prisma.expenseCommitment.update({ where: { id: String(req.params.id) }, data: d })
    return res.json({ success: true, data: { expense: u } })
  }
  app.put('/api/expenses/:id', putExpense)
  app.patch('/api/expenses/:id', putExpense)

  app.delete('/api/expenses/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    await prisma.expenseCommitment.delete({ where: { id: req.params.id } })
    return res.json({ success: true })
  })

  app.get('/api/events', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { events: getDemoFinances().events }, demo: true })
    }
    const events = await prisma.upcomingEvent.findMany({ orderBy: { eventDate: 'asc' } })
    return res.json({ success: true, data: { events } })
  })

  app.post('/api/events', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const ev = await prisma.upcomingEvent.create({
      data: {
        eventDate: new Date(b.eventDate),
        title: String(b.title),
        category: String(b.category || 'OTHER'),
        budgetCzk: Number(b.budgetCzk),
        reservedCzk: b.reservedCzk != null ? Number(b.reservedCzk) : 0,
        status: String(b.status || 'UPCOMING'),
        notes: b.notes ?? null
      }
    })
    return res.status(201).json({ success: true, data: { event: ev } })
  })

  const putEvent = async (req: Request, res: Response) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.eventDate) d.eventDate = new Date(b.eventDate)
    if (b.budgetCzk != null) d.budgetCzk = Number(b.budgetCzk)
    if (b.reservedCzk != null) d.reservedCzk = Number(b.reservedCzk)
    const u = await prisma.upcomingEvent.update({ where: { id: String(req.params.id) }, data: d })
    return res.json({ success: true, data: { event: u } })
  }
  app.put('/api/events/:id', putEvent)
  app.patch('/api/events/:id', putEvent)

  app.delete('/api/events/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    await prisma.upcomingEvent.delete({ where: { id: req.params.id } })
    return res.json({ success: true })
  })

  app.get('/api/this-month', async (req, res) => {
    const { demo, persona: _p } = await demoState()
    const monthYear = (req.query.monthYear as string) || currentMonthYear()
    if (demo) {
      const d = getDemoFinances()
      return res.json({
        success: true,
        data: { monthYear, profile: d.profile, income: d.income, expenses: d.expenses, events: d.events, plan: d.plan },
        demo: true
      })
    }
    const [profile, income, expenses, events, plan] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: 'default' } }),
      prisma.incomeEvent.findMany({ orderBy: { date: 'desc' } }),
      prisma.expenseCommitment.findMany(),
      prisma.upcomingEvent.findMany(),
      getPlanForMonth(monthYear)
    ])
    return res.json({
      success: true,
      data: { monthYear, profile, income, expenses, events, plan }
    })
  })

  app.get('/api/this-month/adherence', async (req, res) => {
    const { demo } = await demoState()
    const months = Math.min(24, Math.max(1, parseInt(String(req.query.months || '6'), 10) || 6))
    if (demo) {
      return res.json({
        success: true,
        data: {
          months,
          totalRows: 0,
          doneRows: 0,
          skippedRows: 0,
          pendingRows: 0,
          adherencePct: 0,
          onTrackStreakMonths: 0,
          followThroughCzk6m: 0
        },
        demo: true
      })
    }
    try {
      const data = await computeAdherenceStats(months)
      return res.json({ success: true, data })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Adherence failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/api/this-month/history', async (req, res) => {
    const { demo } = await demoState()
    const months = Math.min(24, Math.max(1, parseInt(String(req.query.months || '12'), 10) || 12))
    if (demo) {
      return res.json({ success: true, data: { months, outcomes: [] as unknown[] }, demo: true })
    }
    try {
      const outcomes = await getMonthlyPlanOutcomes(months)
      return res.json({ success: true, data: { months, outcomes } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'History failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.delete('/api/this-month/plan/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    try {
      const p = await prisma.allocationPlan.findUnique({ where: { id: req.params.id } })
      if (!p) return res.status(404).json({ success: false, error: 'Not found' })
      if (p.status === 'EXECUTED') {
        return res.status(403).json({ success: false, error: 'Cannot delete a plan in EXECUTED status' })
      }
      if (p.status !== 'PROPOSED') {
        return res.status(403).json({ success: false, error: 'Only PROPOSED plans can be deleted' })
      }
      await prisma.allocationPlan.delete({ where: { id: p.id } })
      return res.json({ success: true })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Delete failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.patch('/api/this-month/plan/:planId/row/:rowIndex', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const planId = req.params.planId
    const rowIndex = parseInt(req.params.rowIndex, 10)
    if (!isFinite(rowIndex) || rowIndex < 0) {
      return res.status(400).json({ success: false, error: 'Invalid row index' })
    }
    const body = req.body as {
      action?: string
      executedAmountCzk?: number
      executedAt?: string
      skipReason?: string
      navAtExecution?: number
    }
    const action = String(body.action || '').toUpperCase()
    if (!['DONE', 'SKIPPED', 'PENDING'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be DONE, SKIPPED, or PENDING' })
    }
    try {
      const plan = await prisma.allocationPlan.findUnique({ where: { id: planId } })
      if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' })
      const all = plan.allocations as unknown
      if (!Array.isArray(all) || rowIndex >= all.length) {
        return res.status(400).json({ success: false, error: 'Invalid row' })
      }
      const next = all.map((x) => (typeof x === 'object' && x !== null ? { ...(x as object) } : x)) as Record<
        string,
        unknown
      >[]

      const baseRow = { ...(next[rowIndex] as Record<string, unknown>) }

      if (action === 'DONE') {
        await markPlanRowDone(planId, rowIndex, {
          executedAmountCzk: body.executedAmountCzk != null ? Number(body.executedAmountCzk) : undefined,
          executedAt: body.executedAt,
          navAtExecution: body.navAtExecution != null ? Number(body.navAtExecution) : undefined,
          source: 'DASHBOARD'
        })
        const updatedDone = await prisma.allocationPlan.findUnique({ where: { id: planId } })
        return res.json({ success: true, data: { plan: updatedDone } })
      } else if (action === 'SKIPPED') {
        const reason = String(body.skipReason || '').trim()
        if (!reason) return res.status(400).json({ success: false, error: 'skipReason required' })
        const amt = Number((baseRow.amountCzk as number) || 0)
        next[rowIndex] = {
          ...baseRow,
          executionStatus: 'SKIPPED',
          skipReason: reason,
          executedAt: null,
          executedAmountCzk: null
        }
        const r = next[rowIndex] as Record<string, unknown>
        const rowType = String(r.type || 'BUY').toUpperCase()
        const destLabel =
          rowType === 'SELL' ? String(r.source || 'position') : String(r.destination || 'destination')
        const skipLine =
          rowType === 'SELL'
            ? `Skipped sell ${amt} CZK from ${destLabel}: ${reason}`
            : `Skipped ${amt} CZK to ${destLabel}: ${reason}`
        await prisma.advisorJournal.create({
          data: {
            category: 'MISSED',
            content: skipLine,
            relatedIsin: r.isin != null ? String(r.isin) : null,
            impactCzk: null,
            metadata: { planId, rowIndex, action: 'SKIPPED' } as object
          }
        })
      } else {
        next[rowIndex] = {
          ...baseRow,
          executionStatus: 'PENDING',
          executedAt: null,
          executedAmountCzk: null,
          skipReason: null
        }
      }

      const updated = await prisma.allocationPlan.update({
        where: { id: planId },
        data: { allocations: next as object }
      })
      return res.json({ success: true, data: { plan: updated } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Update failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/this-month/plan/:planId/mark-all-done', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const planId = String(req.params.planId || '')
    const body = req.body as { executedAt?: string }
    try {
      const existing = await prisma.allocationPlan.findUnique({ where: { id: planId } })
      if (!existing) return res.status(404).json({ success: false, error: 'Plan not found' })
      const n = countPendingInPlan(existing.allocations as unknown)
      if (n === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'NO_PENDING_ROWS', message: 'All rows are already done or skipped.' })
      }
      const plan = await markAllPendingRowsDone(planId, { executedAt: body.executedAt })
      return res.json({ success: true, data: { plan, markedCount: n } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Mark all failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/this-month/generate-now', async (req, res) => {
    const { demo } = await demoState()
    const my = String((req.body as { monthYear?: string })?.monthYear || currentMonthYear())
    if (demo) {
      return res.json({ success: true, data: { plan: getDemoFinances().plan, demo: true } })
    }
    try {
      const existing = await prisma.allocationPlan.findFirst({
        where: { monthYear: my, status: { in: ['PROPOSED', 'CONFIRMED'] } },
        orderBy: { generatedAt: 'desc' }
      })
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'PLAN_ALREADY_EXISTS',
          message: `A plan for ${my} already exists${existing.status ? ` (${existing.status})` : ''}. Open it on /this-month, or delete a PROPOSED plan to run a new generate.`,
          existingPlanId: existing.id,
          planStatus: existing.status,
          generatedAt: existing.generatedAt.toISOString(),
          canDelete: existing.status === 'PROPOSED',
          hint: 'Delete a PROPOSED plan from this page, then use Generate again.',
          monthYear: my
        })
      }
      const plan = await generateMonthlyPlan(my, 'MANUAL')
      return res.status(201).json({ success: true, data: { plan } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Plan failed'
      return res.status(400).json({ success: false, error: m })
    }
  })

  app.get('/api/sip-executions', async (req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { executions: [] as unknown[] }, demo: true })
    }
    const planId = req.query.planId as string | undefined
    const executions = await prisma.sipExecution.findMany({
      where: planId ? { planId } : undefined,
      orderBy: { scheduledDate: 'desc' },
      take: 50
    })
    return res.json({ success: true, data: { executions } })
  })

  app.post('/api/sip-executions', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const r = await prisma.sipExecution.create({
      data: {
        planId: b.planId || null,
        scheduledDate: new Date(b.scheduledDate),
        executedDate: b.executedDate ? new Date(b.executedDate) : null,
        isin: String(b.isin),
        fundName: String(b.fundName),
        amountCzk: Number(b.amountCzk),
        amountLocal: b.amountLocal != null ? Number(b.amountLocal) : null,
        currency: String(b.currency || 'CZK'),
        navAtExecution: b.navAtExecution != null ? Number(b.navAtExecution) : null,
        unitsAcquired: b.unitsAcquired != null ? Number(b.unitsAcquired) : null,
        status: String(b.status || 'PENDING'),
        confirmationMethod: b.confirmationMethod ?? null,
        notes: b.notes ?? null
      }
    })
    return res.status(201).json({ success: true, data: { execution: r } })
  })

  app.get('/api/advisor-journal', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({ success: true, data: { entries: [] as unknown[] }, demo: true })
    }
    const entries = await prisma.advisorJournal.findMany({ orderBy: { date: 'desc' }, take: 30 })
    return res.json({ success: true, data: { entries } })
  })

  app.post('/api/advisor-journal', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const e = await prisma.advisorJournal.create({
      data: {
        category: String(b.category || 'NOTE'),
        content: String(b.content),
        relatedIsin: b.relatedIsin ?? null,
        impactCzk: b.impactCzk != null ? Number(b.impactCzk) : null,
        metadata: b.metadata ?? undefined
      }
    })
    return res.status(201).json({ success: true, data: { entry: e } })
  })

  app.get('/api/reports', async (_req, res) => {
    try {
      const list = await prisma.generatedReport.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
      return res.json({ success: true, data: { reports: list } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'error'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/reports/generate', async (req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.json({
        success: true,
        data: { id: 'demo', viewUrl: '/reports' },
        demo: true
      })
    }
    try {
      const b = req.body as { type?: string; monthYear?: string; audience?: string }
      const aud = b?.audience === 'CLIENT' ? 'CLIENT' : 'INTERNAL'
      const { id, viewUrl } = await createReport(b?.type || 'CFO_10', b?.monthYear, aud)
      return res.json({ success: true, data: { id, viewUrl, audience: aud } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Report failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/reports/view/:id', async (req, res) => {
    const token = String((req.query as { token?: string }).token || '')
    try {
      const r = await prisma.generatedReport.findUnique({ where: { id: String(req.params.id) } })
      if (!r || r.token !== token) {
        return res.status(404).type('html').send('<!doctype html><html><body>Not found</body></html>')
      }
      return res.type('html').send(renderReportViewHtml(r))
    } catch {
      return res.status(500).type('text').send('Error')
    }
  })

  app.post('/api/holdings/refresh-nav', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const holdingId = (req.body as { holdingId?: string } | undefined)?.holdingId
    const { refreshAllCzechNavs } = await import('../lib/nav/refreshAll')
    const r = await refreshAllCzechNavs(holdingId)
    return res.json({ success: true, data: r })
  })

  app.post('/api/library/refresh-scores', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const { refreshAllLibraryScores } = await import('../lib/instrumentLibrary')
    const r = await refreshAllLibraryScores()
    return res.json({ success: true, data: r })
  })

  const patchNreFdIntelligenceRate = async (req: Request, res: Response) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body as { value?: number }
    if (b.value == null || Number.isNaN(Number(b.value))) {
      return res.status(400).json({ success: false, error: 'value required' })
    }
    const existing = await prisma.indiaIntelligence.findFirst({
      where: { id: String(req.params.id), dataType: 'NRE_FD_RATE' }
    })
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' })
    const updated = await prisma.indiaIntelligence.update({
      where: { id: String(req.params.id) },
      data: {
        value: Number(b.value),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 86400000)
      }
    })
    return res.json({ success: true, data: { rate: updated } })
  }
  app.patch('/api/india/fd-rate/:id', patchNreFdIntelligenceRate)
  app.patch('/api/india/nre-fd-rate/:id', patchNreFdIntelligenceRate)

  app.get('/api/india/mf', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) return res.json({ success: true, data: { funds: [] }, demo: true })
    try {
      const { getFXRates } = await import('../lib/fetchers')
      const { indiaMfTaxBadge } = await import('../lib/indiaTax')
      const fx = await getFXRates()
      const czkPerInr = fx.EURINR > 0 ? fx.EURCZK / fx.EURINR : 0
      const rows = await prisma.indiaMutualFund.findMany({ orderBy: { createdAt: 'desc' } })
      const funds = rows.map((r) => {
        const nav =
          r.currentNavInr != null && num(r.currentNavInr) > 0
            ? num(r.currentNavInr)
            : num(r.avgNavInr || 0)
        const valueInr = num(r.units || 0) * nav
        const valueCzk = valueInr * czkPerInr
        const b = indiaMfTaxBadge({ category: r.category, purchaseDate: r.purchaseDate })
        return {
          ...indiaMfWithApiNavFields(r),
          valueInr,
          valueCzk,
          taxLabel: b.label,
          taxTone: b.tone
        }
      })
      return res.json({ success: true, data: { funds, czkPerInr, fx } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'MF list failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/india/mf', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body as Record<string, unknown>
    const nav = indiaMfNavFromBody(b)
    const row = await prisma.indiaMutualFund.create({
      data: {
        schemeName: String(b.schemeName),
        amfiCode: String(b.amfiCode),
        isin: b.isin != null ? String(b.isin) : null,
        amc: b.amc != null ? String(b.amc) : null,
        category: String(b.category || 'EQUITY'),
        units: Number(b.units) || 0,
        avgNavInr: nav.avgNavInr,
        currentNavInr: nav.currentNavInr,
        purchaseDate: new Date(String(b.purchaseDate)),
        folioNumber: b.folioNumber != null ? String(b.folioNumber) : null,
        sipActive: Boolean(b.sipActive),
        sipAmountInr: b.sipAmountInr != null ? Number(b.sipAmountInr) : null,
        notes: b.notes != null ? String(b.notes) : null
      }
    })
    return res.status(201).json({ success: true, data: { fund: indiaMfWithApiNavFields(row) } })
  })

  app.patch('/api/india/mf/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (b.schemeName !== undefined) patch.schemeName = String(b.schemeName)
    if (b.units !== undefined) patch.units = Number(b.units)
    if (b.avgNav !== undefined || b.avgNavInr !== undefined) {
      const v = b.avgNav !== undefined ? b.avgNav : b.avgNavInr
      patch.avgNavInr = v != null && v !== '' ? Number(v) : null
    }
    if (b.currentNav !== undefined || b.currentNavInr !== undefined) {
      const v = b.currentNav !== undefined ? b.currentNav : b.currentNavInr
      patch.currentNavInr = v != null && v !== '' ? Number(v) : null
    }
    if (b.sipActive !== undefined) patch.sipActive = Boolean(b.sipActive)
    if (b.isin !== undefined) patch.isin = b.isin ? String(b.isin) : null
    const row = await prisma.indiaMutualFund.update({
      where: { id: String(req.params.id) },
      data: patch as never
    })
    return res.json({ success: true, data: { fund: indiaMfWithApiNavFields(row) } })
  })

  app.delete('/api/india/mf/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    await prisma.indiaMutualFund.delete({ where: { id: String(req.params.id) } })
    return res.json({ success: true })
  })

  app.get('/api/india/fd', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) return res.json({ success: true, data: { fds: [] }, demo: true })
    const fds = await prisma.indiaFixedDeposit.findMany({ orderBy: { maturityDate: 'asc' } })
    return res.json({ success: true, data: { fds } })
  })

  app.post('/api/india/fd', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body as Record<string, unknown>
    const row = await prisma.indiaFixedDeposit.create({
      data: {
        bank: String(b.bank),
        accountType: String(b.accountType || 'NRE'),
        principalInr: Number(b.principalInr) || 0,
        interestRatePct: Number(b.interestRatePct) || 0,
        startDate: new Date(String(b.startDate)),
        maturityDate: new Date(String(b.maturityDate)),
        interestType: String(b.interestType || 'CUMULATIVE'),
        tdsApplicable: Boolean(b.tdsApplicable),
        autoRenew: Boolean(b.autoRenew)
      }
    })
    return res.status(201).json({ success: true, data: { fd: row } })
  })

  app.patch('/api/india/fd/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body as Record<string, unknown>
    const d: any = { ...b }
    if (b.startDate) d.startDate = new Date(String(b.startDate))
    if (b.maturityDate) d.maturityDate = new Date(String(b.maturityDate))
    if (b.principalInr != null) d.principalInr = Number(b.principalInr)
    if (b.interestRatePct != null) d.interestRatePct = Number(b.interestRatePct)
    const row = await prisma.indiaFixedDeposit.update({ where: { id: String(req.params.id) }, data: d })
    return res.json({ success: true, data: { fd: row } })
  })

  app.delete('/api/india/fd/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    await prisma.indiaFixedDeposit.delete({ where: { id: String(req.params.id) } })
    return res.json({ success: true })
  })

  app.post('/api/india/refresh-nav', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const funds = await prisma.indiaMutualFund.findMany()
    const now = new Date()
    let updated = 0
    for (const f of funds) {
      if (!f.isin) continue
      const nav = await prisma.navHistory.findFirst({
        where: { isin: f.isin },
        orderBy: { date: 'desc' }
      })
      if (nav) {
        await prisma.indiaMutualFund.update({
          where: { id: f.id },
          data: { currentNavInr: nav.nav, lastNavUpdate: now }
        })
        updated += 1
      }
    }
    return res.json({ success: true, data: { updated } })
  })

  app.get('/api/india/amfi/status', async (_req, res) => {
    try {
      const [lastIngest, navRowsAmfi] = await Promise.all([
        prisma.systemHealth.findFirst({
          where: { checkName: 'AMFI_NAV_INGEST' },
          orderBy: { checkedAt: 'desc' }
        }),
        prisma.navHistory.count({ where: { source: 'AMFI_NAVAll' } })
      ])
      return res.json({ success: true, data: { lastIngest, navRowsAmfi } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'AMFI status failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/india/amfi/ingest', async (_req, res) => {
    const { demo } = await demoState()
    if (demo) {
      return res.status(403).json({ success: false, error: 'AMFI ingest requires live mode (turn off demo).' })
    }
    try {
      const { ingestAmfiNavAll } = await import('../lib/amfiIngest')
      const r = await ingestAmfiNavAll()
      if (!r.ok) {
        return res.status(502).json({ success: false, error: r.error || 'Ingest failed', data: r })
      }
      return res.json({ success: true, data: r })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Ingest error'
      return res.status(502).json({ success: false, error: m })
    }
  })
}
