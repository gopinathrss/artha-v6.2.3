import cron from 'node-cron'
import { prisma } from './prisma'
import { getPortfolioSummary } from './portfolio'
import { generateAndSendMonthlyLetter, runMorningJob, runWeeklyBackup } from './triggers'
import { fetchAllRates } from './currency'
import { generateMonthlyPlan } from './allocationPlanner'
import { sendEmail } from './emailService'
import { buildPlanReadyEmail } from './planEmail'

export function startScheduler() {
  cron.schedule(
    '30 16 * * 1-5',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] FX refresh (CZK hub rates)...')
      try {
        await fetchAllRates()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] FX rates updated')
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Scheduler] FX refresh failed:', err?.message || err)
      }
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 * * 1-5',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting weekday morning job...')
      try {
        const r = await runMorningJob()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] FX + prices + triggers done', r)
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Scheduler] Morning job failed:', err?.message || err)
      }
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 1 * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting monthly letter generation...')
      try {
        const portfolio = await getPortfolioSummary()
        const settings = await prisma.settings.findFirst()
        if (settings?.monthlyLetterEnabled && portfolio.success && portfolio.data) {
          await generateAndSendMonthlyLetter(portfolio.data, settings)
          // eslint-disable-next-line no-console
          console.log('[Scheduler] Monthly letter sent')
        }
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Scheduler] Monthly letter failed:', err?.message || err)
      }
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 2 * * 0',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Starting weekly backup...')
      try {
        await runWeeklyBackup()
        // eslint-disable-next-line no-console
        console.log('[Scheduler] Backup complete')
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Scheduler] Backup failed:', err?.message || err)
      }
    },
    { timezone: 'Europe/Prague' }
  )

  cron.schedule(
    '0 6 * * *',
    async () => {
      // eslint-disable-next-line no-console
      console.log('[Scheduler] Daily salary check (auto plan)...')
      try {
        const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
        if (!profile) {
          // eslint-disable-next-line no-console
          console.log('[Scheduler] No profile. Skipping salary check.')
          return
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
          return
        }
        const monthYear = `${tzPrague.getFullYear()}-${String(tzPrague.getMonth() + 1).padStart(2, '0')}`
        const existingPlan = await prisma.allocationPlan.findFirst({
          where: { monthYear, status: { in: ['PROPOSED', 'CONFIRMED'] } }
        })
        if (existingPlan) {
          // eslint-disable-next-line no-console
          console.log(`[Scheduler] Plan for ${monthYear} already exists. Skipping.`)
          return
        }
        // eslint-disable-next-line no-console
        console.log(`[Scheduler] Auto-generating plan for ${monthYear}`)
        const plan = await generateMonthlyPlan(monthYear, 'AUTO_CRON')
        const settings = await prisma.settings.findFirst()
        if (settings?.alertEmail && settings?.smtpUser) {
          const r = await sendEmail(
            settings.alertEmail,
            `ARTHA — Your ${monthYear} plan is ready`,
            buildPlanReadyEmail(plan)
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
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Scheduler] Salary check failed:', err?.message || err)
      }
    },
    { timezone: 'Europe/Prague' }
  )

  // eslint-disable-next-line no-console
  console.log('[Scheduler] All jobs scheduled. Timezone: Europe/Prague')
}
