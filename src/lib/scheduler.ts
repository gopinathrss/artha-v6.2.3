import cron from 'node-cron'
import { getPrisma, realPrisma } from './prisma'
import { getPortfolioSummary } from './portfolio'
import { generateAndSendMonthlyLetter, runMorningJob, runWeeklyBackup } from './triggers'
import { fetchAllRates } from './currency'
import { generateMonthlyPlan } from './allocationPlanner'
import { sendEmail } from './emailService'
import { buildPlanReadyEmail } from './planEmail'
import { runCronJob } from './cronWrapper'
import { pruneOldRows } from './cron/pruneOldRows'
import { ensureCronJobPlaceholders } from './cron/cronPlaceholders'
import { runDailyStrategyEvaluation } from './cron/evaluateStrategies'
import { runCapProximityCheck } from './cron/monitorProfitCaps'

export function startScheduler() {
  cron.schedule(
    '30 16 * * 1-5',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] FX refresh (CZK hub rates)...')
      await runCronJob('fx-refresh-weekday', async () => {
        await fetchAllRates()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] FX rates updated')
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 * * 1-5',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting weekday morning job...')
      await runCronJob('morning-job-weekday', async () => {
        const r = await runMorningJob()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] FX + prices + triggers done', r)
        return { itemsProcessed: r.triggered + r.alertsCreated }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '30 7 * * *',
    async () => {
      await runCronJob('evaluate-strategies', async () => {
        const r = await runDailyStrategyEvaluation()
        return { itemsProcessed: r.evaluated, metadata: r as unknown as object }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 */6 * * *',
    async () => {
      await runCronJob('monitor-profit-caps', async () => {
        const r = await runCapProximityCheck()
        return { itemsProcessed: r.checked, metadata: r as unknown as object }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 1 * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting monthly letter generation...')
      await runCronJob('monthly-letter', async () => {
        const portfolio = await getPortfolioSummary()
        const settings = await realPrisma.settings.findFirst()
        if (settings?.monthlyLetterEnabled && portfolio.success && portfolio.data) {
          await generateAndSendMonthlyLetter(portfolio.data, settings)
          // eslint-disable-next-line no-console
          console.log('[Scheduler] Monthly letter sent')
        }
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 2 * * 0',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting weekly backup...')
      await runCronJob('weekly-backup', async () => {
        await runWeeklyBackup()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] Backup complete')
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 9 1 * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Month-end review reminder (EOM)...')
      await runCronJob('eom-journal', async () => {
        const prisma = await getPrisma()
        const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
        if (!profile) {
          // eslint-disable-next-line no-console
          console.log('[Scheduler] No profile. Skipping EOM journal.')
          return { itemsProcessed: 0 }
        }
        const tzPrague = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }))
        const prev = new Date(tzPrague.getFullYear(), tzPrague.getMonth() - 1, 1)
        const prevLabel = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
        await prisma.advisorJournal.create({
          data: {
            category: 'OBSERVATION',
            content: `Month closed for ${prevLabel} — review allocation follow-through and adherence on /this-month.`,
            metadata: { kind: 'EOM_REVIEW', monthYear: prevLabel } as object
          }
        })
        // eslint-disable-next-line no-console
        console.log('[Scheduler] EOM journal entry created for', prevLabel)
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 * * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Daily salary check (auto plan)...')
      await runCronJob('salary-auto-plan', async () => {
        const prisma = await getPrisma()
        const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
        if (!profile) {
          // eslint-disable-next-line no-console
          console.log('[Scheduler] No profile. Skipping salary check.')
          return { itemsProcessed: 0 }
        }
        const today = new Date()
        const tzPrague = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Prague' }))
        const dayOfMonth = tzPrague.getDate()
        const expectedTriggerDay = profile.salaryDayOfMonth + 1
        if (dayOfMonth !== expectedTriggerDay) {
          // eslint-disable-next-line no-console
          console.log(
            `[Scheduler] Not salary+1 day. today=${dayOfMonth}, expected=${expectedTriggerDay}`
          )
          return { itemsProcessed: 0 }
        }
        const monthYear = `${tzPrague.getFullYear()}-${String(tzPrague.getMonth() + 1).padStart(2, '0')}`
        const existingPlan = await prisma.allocationPlan.findFirst({
          where: { monthYear, status: { in: ['PROPOSED', 'CONFIRMED'] } }
        })
        if (existingPlan) {
          // eslint-disable-next-line no-console
          console.log(`[Scheduler] Plan for ${monthYear} already exists. Skipping.`)
          return { itemsProcessed: 0 }
        }
        // eslint-disable-next-line no-console
        console.log(`[Scheduler] Auto-generating plan for ${monthYear}`)
        const plan = await generateMonthlyPlan(monthYear, 'AUTO_CRON')
        const settings = await realPrisma.settings.findFirst()
        if (settings?.alertEmail && settings?.smtpUser) {
          const r = await sendEmail(
            settings.alertEmail,
            `PIE — Your ${monthYear} plan is ready`,
            await buildPlanReadyEmail(plan)
          )
          if (!r.sent) {
            // eslint-disable-next-line no-console
            console.error('[Scheduler] Plan email not sent:', r.error)
          }
        }
        await prisma.advisorJournal.create({
          data: {
            category: 'OBSERVATION',
            content: `Auto-generated allocation plan for ${monthYear} (salary day +1)`,
            metadata: { planId: plan.id, source: 'AUTO_CRON' } as object
          }
        })
        // eslint-disable-next-line no-console
        console.log('[Scheduler] Plan generated (AUTO_CRON)')
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 8 * * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Daily digest (08:00 Europe/Prague)…')
      await runCronJob('daily-digest', async () => {
        const { buildDailyDigest, getTelegramBot } = await import('./telegram/bot')
        const text = await buildDailyDigest()
        const settings = await realPrisma.settings.findFirst()
        const bot = getTelegramBot()
        if (settings?.telegramChatId && bot) {
          await bot.sendMessage(settings.telegramChatId, text, { parse_mode: 'Markdown' })
        }
        if (settings?.alertEmail && settings?.smtpUser) {
          const safe = String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/\r\n/g, '\n')
          await sendEmail(
            settings.alertEmail,
            'PIE daily digest',
            '<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">' + safe + '</pre>'
          )
        }
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '30 14 * * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] AMFI NAVAll (India)…')
      await runCronJob('amfi-navall-ingest', async () => {
        const { ingestAmfiNavAll } = await import('./amfiIngest')
        const r = await ingestAmfiNavAll()
        if (!r.ok) {
          // eslint-disable-next-line no-console
          console.error('[Scheduler] AMFI ingest failed:', r.error)
        } else {
          // eslint-disable-next-line no-console
          console.log('[Scheduler] AMFI OK inserted=', r.inserted, 'parsed=', r.parsed)
        }
        return { itemsProcessed: r.inserted }
      })
    },
    { timezone: 'Asia/Kolkata' }
  )

  cron.schedule(
    '0 17 * * 1-5',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Czech NAV refresh starting')
      await runCronJob('nav-refresh-czech', async () => {
        const { refreshAllCzechNavs } = await import('./nav/refreshAll')
        const result = await refreshAllCzechNavs()
        // eslint-disable-next-line no-console
        console.log(
          `[Scheduler] Czech NAV refresh: ${result.refreshed} refreshed, ${result.failed} failed, ${result.skipped} skipped`
        )
        if (result.errors.length > 0) {
          const prisma = await getPrisma()
          await prisma.advisorJournal.create({
            data: {
              category: 'OBSERVATION',
              content: `Czech NAV refresh had ${result.failed} failures: ${result.errors.map((e) => e.holdingId).join(', ')}`,
              metadata: { errors: result.errors } as object
            }
          })
        }
        return { itemsProcessed: result.refreshed }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 2 1 * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Library scores refresh (monthly)…')
      await runCronJob('library-scores-monthly', async () => {
        const { refreshAllLibraryScores } = await import('./instrumentLibrary')
        const result = await refreshAllLibraryScores()
        // eslint-disable-next-line no-console
        console.log(
          `[Scheduler] Library scores refresh: ${result.updated} updated, ${result.errors} errors`
        )
        return { itemsProcessed: result.updated }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 2 * * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Outcome evaluation starting')
      await runCronJob('outcome-evaluation-daily', async () => {
        const { evaluatePendingOutcomes } = await import('./outcomeEvaluation')
        const r = await evaluatePendingOutcomes()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] Outcome evaluation done, touched=', r.touched)
        return { itemsProcessed: r.touched }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 9-21 * * *',
    async () => {
      await runCronJob('email-ingestion', async () => {
        const { runEmailIngestion } = await import('./ingestion/orchestrator')
        const result = await runEmailIngestion()
        return { itemsProcessed: result.fetched }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 3 1 1,4,7,10 *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Historical NAV refresh (quarterly, Tier 2)…')
      await runCronJob('historical-nav-refresh-quarterly', async () => {
        const { importAllHistoricalNavs } = await import('./historical/import')
        const r = await importAllHistoricalNavs()
        if (r.errors.length) {
          // eslint-disable-next-line no-console
          console.error('[Scheduler] Historical import errors (sample):', r.errors.slice(0, 5))
        }
        return { itemsProcessed: r.processed }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '20 6 1 * *',
    async () => {
      await runCronJob('monthly-report-smart', async () => {
        const { generateSmartReport } = await import('./reports/generator')
        const { deliverReport } = await import('./reports/delivery')
        const r = await generateSmartReport('MONTHLY')
        await deliverReport(r, { type: 'MONTHLY' })
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '30 6 1 1,4,7,10 *',
    async () => {
      await runCronJob('quarterly-report-smart', async () => {
        const { generateSmartReport } = await import('./reports/generator')
        const { deliverReport } = await import('./reports/delivery')
        const r = await generateSmartReport('QUARTERLY')
        await deliverReport(r, { type: 'QUARTERLY' })
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 7 1 4 *',
    async () => {
      await runCronJob('tax-year-report-smart', async () => {
        const { generateSmartReport } = await import('./reports/generator')
        const { deliverReport } = await import('./reports/delivery')
        const r = await generateSmartReport('TAX_YEAR')
        await deliverReport(r, { type: 'TAX_YEAR' })
        return { itemsProcessed: 1 }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 3 * * 0',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] TTL prune (CronExecution / SystemHealth / email previews / dismissed alerts)…')
      await runCronJob('prune-old-rows', async () => {
        const prisma = await getPrisma()
        const r = await pruneOldRows(prisma)
        // eslint-disable-next-line no-console
        console.log(
          '[Scheduler] Prune done cron=',
          r.cronDeleted,
          'health=',
          r.healthDeleted,
          'emailPreview=',
          r.emailDeleted,
          'alerts=',
          r.alertDeleted
        )
        return {
          itemsProcessed: r.cronDeleted + r.healthDeleted + r.emailDeleted + r.alertDeleted,
          metadata: r as unknown as object
        }
      })
    },
    { timezone: 'Europe/Prague' }
  )

  void (async () => {
    try {
      const prisma = await getPrisma()
      await ensureCronJobPlaceholders(prisma)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Scheduler] Cron placeholders failed', e)
    }
  })()

  // eslint-disable-next-line no-console
  console.log('[Scheduler] All jobs scheduled. Main TZ: Europe/Prague; AMFI: Asia/Kolkata')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Cron execution ledger active (CronExecution table)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Outcome evaluation cron registered (daily 02:00 Europe/Prague)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Czech NAV refresh registered (weekdays 17:00 Europe/Prague)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Library scores cron registered (1st of month 02:00 Europe/Prague)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Email ingestion cron registered (hourly 09:00–21:00 Europe/Prague)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Historical NAV bulk refresh registered (quarterly 03:00 Europe/Prague)')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] Smart reports: monthly 06:20, quarterly 06:30 (quarter months), tax-year Apr 1 07:00')
  // eslint-disable-next-line no-console
  console.log('[Scheduler] TTL prune registered (Sunday 03:00 Europe/Prague)')
}
