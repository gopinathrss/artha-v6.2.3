const THEMES = new Set(['AUTO', 'LIGHT', 'DARK'])
const CURRENCIES = new Set(['CZK', 'EUR', 'USD', 'INR'])
const RISK = new Set(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'])
const AI_DEFAULT_KEYS = new Set(['ai.openai', 'ai.anthropic', 'ai.gemini'])
const ACCENTS = new Set(['BLUE', 'GREEN', 'PURPLE', 'AMBER', 'ROSE'])
const TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-/]{1,63}$/

export type AppSettingsValidationError = { field: string; message: string }

export function validateAppSettingsPatch(body: Record<string, unknown>): AppSettingsValidationError | null {
  if (body.themeMode != null && !THEMES.has(String(body.themeMode).toUpperCase())) {
    return { field: 'themeMode', message: 'themeMode must be AUTO, LIGHT, or DARK' }
  }
  if (body.displayCurrency != null && !CURRENCIES.has(String(body.displayCurrency).toUpperCase())) {
    return { field: 'displayCurrency', message: 'displayCurrency must be CZK, EUR, USD, or INR' }
  }
  if (body.riskProfile != null && !RISK.has(String(body.riskProfile).toUpperCase())) {
    return { field: 'riskProfile', message: 'riskProfile must be CONSERVATIVE, MODERATE, or AGGRESSIVE' }
  }
  if (
    body.dashboardAuthEnabled != null &&
    typeof body.dashboardAuthEnabled !== 'boolean'
  ) {
    return { field: 'dashboardAuthEnabled', message: 'dashboardAuthEnabled must be a boolean' }
  }
  if (body.accentColor != null && !ACCENTS.has(String(body.accentColor).toUpperCase())) {
    return { field: 'accentColor', message: 'accentColor must be BLUE, GREEN, PURPLE, AMBER, or ROSE' }
  }
  if (body.timezone != null && body.timezone !== '' && !TIMEZONE_RE.test(String(body.timezone))) {
    return { field: 'timezone', message: 'timezone has an invalid format (expected IANA, e.g. Europe/Prague)' }
  }
  if (body.customCategories !== undefined && body.customCategories !== null) {
    if (!Array.isArray(body.customCategories)) {
      return { field: 'customCategories', message: 'customCategories must be an array of strings' }
    }
    for (const c of body.customCategories) {
      if (typeof c !== 'string') {
        return { field: 'customCategories', message: 'customCategories entries must be strings' }
      }
      if (c.length > 64) {
        return { field: 'customCategories', message: 'each category must be 64 chars or fewer' }
      }
    }
    if (body.customCategories.length > 32) {
      return { field: 'customCategories', message: 'at most 32 custom categories' }
    }
  }
  if (body.targetWealthCzk !== undefined && body.targetWealthCzk !== null) {
    const n = Number(body.targetWealthCzk)
    if (!Number.isFinite(n) || n < 0) {
      return { field: 'targetWealthCzk', message: 'targetWealthCzk must be a non-negative number' }
    }
  }
  if (body.targetDate !== undefined && body.targetDate !== null && body.targetDate !== '') {
    const dt = new Date(String(body.targetDate))
    if (Number.isNaN(dt.getTime())) {
      return { field: 'targetDate', message: 'targetDate must be a valid ISO date string' }
    }
  }
  if (body.minSellThresholdCzk !== undefined && body.minSellThresholdCzk !== null) {
    const n = Number(body.minSellThresholdCzk)
    if (!Number.isFinite(n) || n < 0 || n > 50_000_000) {
      return { field: 'minSellThresholdCzk', message: 'minSellThresholdCzk must be between 0 and 50 000 000' }
    }
  }
  if (body.defaultAiProviderKey !== undefined && body.defaultAiProviderKey !== null && body.defaultAiProviderKey !== '') {
    const ak = String(body.defaultAiProviderKey)
    if (!AI_DEFAULT_KEYS.has(ak)) {
      return { field: 'defaultAiProviderKey', message: 'defaultAiProviderKey must be ai.openai, ai.anthropic, or ai.gemini' }
    }
  }

  const hasAllTargets =
    body.targetEquityPct != null && body.targetBondsPct != null && body.targetCashPct != null
  if (hasAllTargets) {
    const eq = Number(body.targetEquityPct)
    const bd = Number(body.targetBondsPct)
    const cs = Number(body.targetCashPct)
    if (eq < 0 || eq > 100 || bd < 0 || bd > 100 || cs < 0 || cs > 100) {
      return { field: 'targets', message: 'Each target must be between 0 and 100' }
    }
    const sum = eq + bd + cs
    if (Math.abs(sum - 100) > 0.01) {
      return { field: 'targets', message: 'Allocation must sum to 100' }
    }
  }
  return null
}
