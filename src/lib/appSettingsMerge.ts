import type { AppSettings, Prisma, PrismaClient } from '@prisma/client'
import { num, type MoneyInput } from './money'

const DEFAULT_ID = 'default'

/** Ensures `AppSettings` row exists (copies numeric toggles from legacy `Settings` once). */
export async function ensureAppSettings(prisma: PrismaClient): Promise<void> {
  let existing: { id: string } | null = null
  try {
    existing = await prisma.appSettings.findUnique({ where: { id: DEFAULT_ID } })
  } catch {
    return
  }
  if (existing) return
  const leg = await prisma.settings.findFirst({ orderBy: { createdAt: 'asc' } })
  const aiKey =
    leg?.aiProvider === 'anthropic' ? 'ai.anthropic' : leg?.aiProvider === 'openai' ? 'ai.openai' : null
  try {
    await prisma.appSettings.create({
    data: {
      id: DEFAULT_ID,
      themeMode: 'AUTO',
      displayCurrency: 'CZK',
      defaultAiProviderKey: aiKey,
      riskProfile: (leg?.riskProfile && leg.riskProfile.trim()) || 'MODERATE',
      demoModeEnabled: leg?.demoModeEnabled ?? false,
      demoPersona: leg?.demoPersona ?? 'engineer',
      alertsEnabled: leg?.alertsEnabled ?? true,
      monthlyLetterEnabled: leg?.monthlyLetterEnabled ?? true,
      confidenceEnabled: leg?.confidenceEnabled ?? true,
      taxFreeWindowAllowsBuy: leg?.taxFreeWindowAllowsBuy ?? false,
      targetEquityPct: leg?.targetEquityPct ?? 65,
      targetBondsPct: leg?.targetBondsPct ?? 25,
      targetCashPct: leg?.targetCashPct ?? 10,
      targetWealthCzk: leg?.targetWealthCzk ?? undefined,
      targetDate: leg?.targetDate ?? undefined,
      cronExecutionRetentionDays: leg?.cronExecutionRetentionDays ?? 90,
      systemHealthRetentionDays: leg?.systemHealthRetentionDays ?? 60,
      emailPreviewRetentionDays: leg?.emailPreviewRetentionDays ?? 30,
      alertLogDismissedRetentionDays: leg?.alertLogDismissedRetentionDays ?? 90,
      onboardingComplete: leg?.onboardingComplete ?? false,
      timezone: leg?.timezone ?? 'Europe/Prague',
      autoIngestEmails: leg?.autoIngestEmails ?? false
    }
  })
  } catch {
    /* table missing until migration */
  }
}

export type MergedSettings = {
  targetEquityPct: number
  targetBondsPct: number
  targetCashPct: number
  targetWealthCzk: number | null
  targetDate: Date | null
  riskProfile: string
  demoModeEnabled: boolean
  demoPersona: string
  alertsEnabled: boolean
  monthlyLetterEnabled: boolean
  confidenceEnabled: boolean
  taxFreeWindowAllowsBuy: boolean
  onboardingComplete: boolean
  timezone: string
  cronExecutionRetentionDays: number
  systemHealthRetentionDays: number
  emailPreviewRetentionDays: number
  alertLogDismissedRetentionDays: number
  autoIngestEmails: boolean
  themeMode: string
  displayCurrency: string
  defaultAiProviderKey: string | null
  aiDebugLogging: boolean
  minSellThresholdCzk: number
}

/** Finances / UserProfile risk wins over AppSettings copy of legacy Settings (Area 2). */
export function mergeRiskProfileLayers(
  userProfileRisk: string | null | undefined,
  appRisk: string | null | undefined,
  legacyRisk: string | null | undefined
): string {
  const u = userProfileRisk?.trim()
  if (u) return u
  const a = appRisk?.trim()
  if (a) return a
  return legacyRisk?.trim() || 'MODERATE'
}

/** Allocation + toggles: AppSettings wins when present; falls back to legacy Settings. */
export async function getMergedSettings(prisma: PrismaClient): Promise<MergedSettings> {
  await ensureAppSettings(prisma)
  let app: AppSettings | null = null
  try {
    app = await prisma.appSettings.findUnique({ where: { id: DEFAULT_ID } })
  } catch {
    app = null
  }
  const userProfilePromise =
    typeof prisma.userProfile?.findUnique === 'function'
      ? prisma.userProfile.findUnique({ where: { id: 'default' } }).catch(() => null)
      : Promise.resolve(null)
  const [leg, userProfile] = await Promise.all([
    prisma.settings.findFirst({ orderBy: { createdAt: 'asc' } }),
    userProfilePromise
  ])
  const mergedRisk = mergeRiskProfileLayers(userProfile?.riskProfile, app?.riskProfile, leg?.riskProfile)
  if (!app) {
    return {
      targetEquityPct: num(leg?.targetEquityPct ?? 65),
      targetBondsPct: num(leg?.targetBondsPct ?? 25),
      targetCashPct: num(leg?.targetCashPct ?? 10),
      targetWealthCzk: leg?.targetWealthCzk != null ? num(leg.targetWealthCzk) : null,
      targetDate: leg?.targetDate ?? null,
      riskProfile: mergedRisk,
      demoModeEnabled: leg?.demoModeEnabled ?? false,
      demoPersona: leg?.demoPersona ?? 'engineer',
      alertsEnabled: leg?.alertsEnabled ?? true,
      monthlyLetterEnabled: leg?.monthlyLetterEnabled ?? true,
      confidenceEnabled: leg?.confidenceEnabled ?? true,
      taxFreeWindowAllowsBuy: leg?.taxFreeWindowAllowsBuy ?? false,
      onboardingComplete: leg?.onboardingComplete ?? false,
      timezone: leg?.timezone || 'Europe/Prague',
      cronExecutionRetentionDays: leg?.cronExecutionRetentionDays ?? 90,
      systemHealthRetentionDays: leg?.systemHealthRetentionDays ?? 60,
      emailPreviewRetentionDays: leg?.emailPreviewRetentionDays ?? 30,
      alertLogDismissedRetentionDays: leg?.alertLogDismissedRetentionDays ?? 90,
      autoIngestEmails: leg?.autoIngestEmails ?? false,
      themeMode: 'AUTO',
      displayCurrency: 'CZK',
      defaultAiProviderKey:
        leg?.aiProvider === 'anthropic' ? 'ai.anthropic' : leg?.aiProvider === 'openai' ? 'ai.openai' : null,
      aiDebugLogging: false,
      minSellThresholdCzk: 1000
    }
  }
  const pick = <T>(a: T | null | undefined, b: T | null | undefined, d: T): T =>
    a !== undefined && a !== null ? (a as T) : b !== undefined && b !== null ? (b as T) : d

  return {
    targetEquityPct: num(app.targetEquityPct ?? leg?.targetEquityPct ?? 65),
    targetBondsPct: num(app.targetBondsPct ?? leg?.targetBondsPct ?? 25),
    targetCashPct: num(app.targetCashPct ?? leg?.targetCashPct ?? 10),
    targetWealthCzk: app.targetWealthCzk != null ? num(app.targetWealthCzk) : leg?.targetWealthCzk != null ? num(leg.targetWealthCzk) : null,
    targetDate: app.targetDate ?? leg?.targetDate ?? null,
    riskProfile: mergedRisk,
    demoModeEnabled: app.demoModeEnabled,
    demoPersona: app.demoPersona || 'engineer',
    alertsEnabled: app.alertsEnabled,
    monthlyLetterEnabled: app.monthlyLetterEnabled,
    confidenceEnabled: app.confidenceEnabled,
    taxFreeWindowAllowsBuy: app.taxFreeWindowAllowsBuy,
    onboardingComplete: pick(app.onboardingComplete, leg?.onboardingComplete, false),
    timezone: app.timezone || leg?.timezone || 'Europe/Prague',
    cronExecutionRetentionDays: app.cronExecutionRetentionDays ?? leg?.cronExecutionRetentionDays ?? 90,
    systemHealthRetentionDays: app.systemHealthRetentionDays ?? leg?.systemHealthRetentionDays ?? 60,
    emailPreviewRetentionDays: app.emailPreviewRetentionDays ?? leg?.emailPreviewRetentionDays ?? 30,
    alertLogDismissedRetentionDays:
      app.alertLogDismissedRetentionDays ?? leg?.alertLogDismissedRetentionDays ?? 90,
    autoIngestEmails: pick(app.autoIngestEmails, leg?.autoIngestEmails, false),
    themeMode: app.themeMode || 'AUTO',
    displayCurrency: app.displayCurrency || 'CZK',
    defaultAiProviderKey: app.defaultAiProviderKey ?? null,
    aiDebugLogging: app.aiDebugLogging ?? false,
    minSellThresholdCzk: (() => {
      const raw = (app as unknown as { minSellThresholdCzk?: MoneyInput | null }).minSellThresholdCzk
      return raw != null ? num(raw) : 1000
    })()
  }
}

export function appSettingsPatchData(body: Record<string, unknown>): Prisma.AppSettingsUpdateInput {
  const d: Prisma.AppSettingsUpdateInput = {}
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined)
  const bool = (k: string) => (typeof body[k] === 'boolean' ? (body[k] as boolean) : undefined)
  const numOrDec = (k: string) => body[k]

  if (str('themeMode') !== undefined) d.themeMode = str('themeMode')
  if (str('displayCurrency') !== undefined) d.displayCurrency = str('displayCurrency')
  if (body.defaultAiProviderKey !== undefined) {
    const raw = body.defaultAiProviderKey
    d.defaultAiProviderKey = raw == null || raw === '' ? null : String(raw)
  }
  if (str('riskProfile') !== undefined) d.riskProfile = str('riskProfile')
  if (bool('demoModeEnabled') !== undefined) d.demoModeEnabled = bool('demoModeEnabled')
  if (str('demoPersona') !== undefined) d.demoPersona = str('demoPersona')
  if (bool('alertsEnabled') !== undefined) d.alertsEnabled = bool('alertsEnabled')
  if (bool('monthlyLetterEnabled') !== undefined) d.monthlyLetterEnabled = bool('monthlyLetterEnabled')
  if (bool('confidenceEnabled') !== undefined) d.confidenceEnabled = bool('confidenceEnabled')
  if (bool('taxFreeWindowAllowsBuy') !== undefined) d.taxFreeWindowAllowsBuy = bool('taxFreeWindowAllowsBuy')
  if (bool('aiDebugLogging') !== undefined) d.aiDebugLogging = bool('aiDebugLogging')
  if (bool('dashboardAuthEnabled') !== undefined) d.dashboardAuthEnabled = bool('dashboardAuthEnabled')
  if (bool('onboardingComplete') !== undefined) d.onboardingComplete = bool('onboardingComplete')
  if (str('timezone') !== undefined) d.timezone = str('timezone')
  if (bool('autoIngestEmails') !== undefined) d.autoIngestEmails = bool('autoIngestEmails')
  if (numOrDec('targetEquityPct') !== undefined) d.targetEquityPct = numOrDec('targetEquityPct') as never
  if (numOrDec('targetBondsPct') !== undefined) d.targetBondsPct = numOrDec('targetBondsPct') as never
  if (numOrDec('targetCashPct') !== undefined) d.targetCashPct = numOrDec('targetCashPct') as never
  if (body.targetWealthCzk !== undefined) d.targetWealthCzk = body.targetWealthCzk as never
  if (body.targetDate !== undefined) d.targetDate = body.targetDate ? new Date(String(body.targetDate)) : null
  if (str('accentColor') !== undefined) {
    const ac = String(body.accentColor).toUpperCase()
    ;(d as Record<string, unknown>).accentColor = ac
  }
  if (body.customCategories !== undefined && Array.isArray(body.customCategories)) {
    ;(d as Record<string, unknown>).customCategories = body.customCategories as never
  }
  if (typeof body.cronExecutionRetentionDays === 'number') d.cronExecutionRetentionDays = body.cronExecutionRetentionDays
  if (typeof body.systemHealthRetentionDays === 'number') d.systemHealthRetentionDays = body.systemHealthRetentionDays
  if (typeof body.emailPreviewRetentionDays === 'number') d.emailPreviewRetentionDays = body.emailPreviewRetentionDays
  if (typeof body.alertLogDismissedRetentionDays === 'number')
    d.alertLogDismissedRetentionDays = body.alertLogDismissedRetentionDays
  if (numOrDec('minSellThresholdCzk') !== undefined) {
    ;(d as Record<string, unknown>).minSellThresholdCzk = numOrDec('minSellThresholdCzk')
  }
  return d
}
