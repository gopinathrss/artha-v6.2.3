import type { Application, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { getDemoFinances } from '../lib/demoData'
import { createReport, renderReportViewHtml } from '../lib/reportsService'
import { runHealthChecks } from '../lib/health'
import { currentMonthYear, generateMonthlyPlan, getPlanForMonth } from '../lib/allocationPlanner'
import { sendEmail } from '../lib/emailService'
import { buildPlanReadyEmail } from '../lib/planEmail'
import { computeAdherenceStats } from '../lib/adherence'

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
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const h = await runHealthChecks()
      res.json({ success: true, data: h })
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
    let p = await prisma.userProfile.findUnique({ where: { id: 'default' } })
    if (!p) {
      p = await prisma.userProfile.create({ data: defaultProfileCreate() })
    }
    return res.json({ success: true, data: { profile: p } })
  })

  app.put('/api/profile', async (req, res) => {
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
  })

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
    const row = await prisma.incomeEvent.create({
      data: {
        date: new Date(b.date),
        source: String(b.source || 'OTHER'),
        amountLocal: Number(b.amountLocal ?? b.amountCzk),
        currency: String(b.currency || 'CZK'),
        amountCzk: Number(b.amountCzk),
        recurring: Boolean(b.recurring),
        notes: b.notes ?? null
      }
    })
    return res.status(201).json({ success: true, data: { event: row } })
  })

  app.put('/api/income/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.date) d.date = new Date(b.date)
    if (b.amountCzk != null) d.amountCzk = Number(b.amountCzk)
    if (b.amountLocal != null) d.amountLocal = Number(b.amountLocal)
    const u = await prisma.incomeEvent.update({ where: { id: req.params.id }, data: d })
    return res.json({ success: true, data: { event: u } })
  })

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

  app.put('/api/expenses/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.startDate) d.startDate = new Date(b.startDate)
    if (b.endDate) d.endDate = new Date(b.endDate)
    if (b.amountCzk != null) d.amountCzk = Number(b.amountCzk)
    const u = await prisma.expenseCommitment.update({ where: { id: req.params.id }, data: d })
    return res.json({ success: true, data: { expense: u } })
  })

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

  app.put('/api/events/:id', async (req, res) => {
    const { demo } = await demoState()
    if (demo) return res.status(403).json({ success: false, error: 'Demo mode' })
    const b = req.body
    const d: any = { ...b }
    if (b.eventDate) d.eventDate = new Date(b.eventDate)
    if (b.budgetCzk != null) d.budgetCzk = Number(b.budgetCzk)
    if (b.reservedCzk != null) d.reservedCzk = Number(b.reservedCzk)
    const u = await prisma.upcomingEvent.update({ where: { id: req.params.id }, data: d })
    return res.json({ success: true, data: { event: u } })
  })

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
        data: { months, totalRows: 0, doneRows: 0, skippedRows: 0, pendingRows: 0, adherencePct: 0 },
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
    const body = req.body as { action?: string; executedAmountCzk?: number; executedAt?: string; skipReason?: string }
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
        const executedAmountCzk = Number(
          body.executedAmountCzk != null ? body.executedAmountCzk : (baseRow.amountCzk as number) || 0
        )
        const executedAt = body.executedAt
          ? new Date(body.executedAt).toISOString()
          : new Date().toISOString()
        next[rowIndex] = {
          ...baseRow,
          executionStatus: 'DONE',
          executedAt,
          executedAmountCzk,
          skipReason: null
        }
        const r = next[rowIndex] as Record<string, unknown>
        const isin = r.isin != null ? String(r.isin) : ''
        if (isin) {
          await prisma.sipExecution.create({
            data: {
              planId,
              scheduledDate: new Date(),
              executedDate: new Date(executedAt),
              isin,
              fundName: String(r.destination || 'Fund'),
              amountCzk: executedAmountCzk,
              currency: String(r.currency || 'CZK'),
              status: 'EXECUTED',
              notes: 'From allocation plan row',
              navAtExecution: null,
              unitsAcquired: null,
              amountLocal: null,
              confirmationMethod: 'DASHBOARD'
            }
          })
        }
        await prisma.advisorJournal.create({
          data: {
            category: 'FOLLOWED',
            content: `Executed ${executedAmountCzk} CZK to ${String(r.destination || 'destination')}`,
            relatedIsin: isin || null,
            impactCzk: executedAmountCzk,
            metadata: { planId, rowIndex, action: 'DONE' } as object
          }
        })
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
        await prisma.advisorJournal.create({
          data: {
            category: 'MISSED',
            content: `Skipped ${amt} CZK to ${String(r.destination || 'destination')}: ${reason}`,
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
          error: 'PLAN_ALREADY_EXISTS',
          message: `Plan for ${my} already exists with status ${existing.status}.`,
          existingPlanId: existing.id,
          generatedAt: existing.generatedAt,
          hint: 'Delete the existing plan first, or modify it.',
          monthYear: my
        })
      }
      const plan = await generateMonthlyPlan(my, 'MANUAL')
      return res.json({ success: true, data: { plan } })
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
      const b = req.body as { type?: string; monthYear?: string }
      const { id, viewUrl } = await createReport(b?.type || 'SNAPSHOT', b?.monthYear)
      return res.json({ success: true, data: { id, viewUrl } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Report failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/reports/view/:id', async (req, res) => {
    const token = String((req.query as { token?: string }).token || '')
    try {
      const r = await prisma.generatedReport.findUnique({ where: { id: req.params.id } })
      if (!r || r.token !== token) {
        return res.status(404).type('html').send('<!doctype html><html><body>Not found</body></html>')
      }
      return res.type('html').send(renderReportViewHtml(r))
    } catch {
      return res.status(500).type('text').send('Error')
    }
  })
}
