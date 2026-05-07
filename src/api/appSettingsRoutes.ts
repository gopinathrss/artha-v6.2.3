import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { realPrisma } from '../lib/prisma'
import { appSettingsPatchData, ensureAppSettings, getMergedSettings } from '../lib/appSettingsMerge'
import { validateAppSettingsPatch } from '../lib/validators/appSettings'
import { auditSettingsChange } from '../lib/audit'
import { omitDashboardAuthSecrets, refreshDashboardAuthEnabledFromDb } from '../lib/dashboardAuth'
import { invalidateDemoStateCache } from '../lib/prismaProvider'
import { wipeAndSeedDemoDb } from '../lib/demoSeed'
import { syncAiIntegrationRowsToActive } from '../lib/integrations/singleActiveAi'

export function registerAppSettingsRoutes(app: Express): void {
  app.get('/api/app-settings/theme', async (_req, res) => {
    try {
      await ensureAppSettings(realPrisma)
      const m = await getMergedSettings(realPrisma)
      // V6: also publish accentColor here so theme.js can paint before settings.js loads.
      let accentColor = 'BLUE'
      try {
        const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } })
        const a = (row as { accentColor?: string | null } | null)?.accentColor
        if (a) accentColor = String(a).toUpperCase()
      } catch {
        /* migration may not have run yet */
      }
      res.json({ success: true, data: { themeMode: m.themeMode, accentColor } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/app-settings', async (_req, res) => {
    try {
      await ensureAppSettings(realPrisma)
      const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } }).catch(() => null)
      if (!row) {
        const m = await getMergedSettings(realPrisma)
        return res.json({
          success: true,
          data: {
            settings: { ...m, hasDashboardBootstrapKey: false },
            effectiveRiskProfile: m.riskProfile,
            source: 'legacy-merge'
          }
        })
      }
      const hasDashboardBootstrapKey = !!(row as { dashboardBootstrapKeyHash?: string | null })
        .dashboardBootstrapKeyHash
      const settings = omitDashboardAuthSecrets(row as Record<string, unknown>) as Record<string, unknown>
      const m = await getMergedSettings(realPrisma)
      res.json({
        success: true,
        data: {
          settings: { ...settings, hasDashboardBootstrapKey },
          effectiveRiskProfile: m.riskProfile,
          source: 'app'
        }
      })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/app-settings', async (req, res) => {
    try {
      const raw = (req.body || {}) as Record<string, unknown>
      const phraseRaw = raw.dashboardBootstrapPhrase
      const body = { ...raw }
      delete body.dashboardBootstrapPhrase

      const err = validateAppSettingsPatch(body)
      if (err) return res.status(400).json({ success: false, error: err.message, field: err.field })

      let bootstrapHashUpdate: { dashboardBootstrapKeyHash: string } | null = null
      if (phraseRaw !== undefined && phraseRaw !== null && String(phraseRaw).trim() !== '') {
        const phrase = String(phraseRaw).trim()
        if (phrase.length < 8) {
          return res.status(400).json({
            success: false,
            error: 'Bootstrap phrase must be at least 8 characters (or omit the field).'
          })
        }
        bootstrapHashUpdate = { dashboardBootstrapKeyHash: await bcrypt.hash(phrase, 11) }
      }

      await ensureAppSettings(realPrisma)
      const before = await realPrisma.appSettings.findUnique({ where: { id: 'default' } }).catch(() => null)
      const patch: Record<string, unknown> = { ...appSettingsPatchData(body) }
      if (bootstrapHashUpdate) Object.assign(patch, bootstrapHashUpdate)
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields' })
      }

      const prevDemo = before?.demoModeEnabled ?? false
      const updated = await realPrisma.appSettings.update({
        where: { id: 'default' },
        data: patch as never
      })
      if (Object.prototype.hasOwnProperty.call(patch, 'dashboardAuthEnabled')) {
        await refreshDashboardAuthEnabledFromDb(realPrisma)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'defaultAiProviderKey')) {
        await syncAiIntegrationRowsToActive(realPrisma, updated.defaultAiProviderKey)
      }
      await auditSettingsChange(realPrisma, { path: 'AppSettings', before, after: updated })

      const nextDemo = updated.demoModeEnabled
      if (nextDemo && !prevDemo) {
        const persona =
          typeof body.demoPersona === 'string' && body.demoPersona.length > 0
            ? body.demoPersona
            : updated.demoPersona
        await wipeAndSeedDemoDb(persona)
        invalidateDemoStateCache()
      } else if (!nextDemo && prevDemo) {
        invalidateDemoStateCache()
      }

      const legRow = await realPrisma.settings.findFirst({ orderBy: { createdAt: 'asc' } })
      if (legRow) {
        await realPrisma.settings.update({
          where: { id: legRow.id },
          data: {
            demoModeEnabled: updated.demoModeEnabled,
            demoPersona: updated.demoPersona,
            targetEquityPct: updated.targetEquityPct,
            targetBondsPct: updated.targetBondsPct,
            targetCashPct: updated.targetCashPct,
            riskProfile: updated.riskProfile,
            alertsEnabled: updated.alertsEnabled,
            monthlyLetterEnabled: updated.monthlyLetterEnabled,
            confidenceEnabled: updated.confidenceEnabled,
            taxFreeWindowAllowsBuy: updated.taxFreeWindowAllowsBuy,
            onboardingComplete: updated.onboardingComplete,
            timezone: updated.timezone,
            cronExecutionRetentionDays: updated.cronExecutionRetentionDays,
            systemHealthRetentionDays: updated.systemHealthRetentionDays,
            emailPreviewRetentionDays: updated.emailPreviewRetentionDays,
            alertLogDismissedRetentionDays: updated.alertLogDismissedRetentionDays,
            autoIngestEmails: updated.autoIngestEmails
          } as never
        })
      }

      res.json({ success: true, data: { saved: true } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
