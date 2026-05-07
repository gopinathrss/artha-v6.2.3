/**
 * V5.2: **Only** module that reads integration API keys from `process.env` at runtime.
 * All other code must use `IntegrationStore` / `resolveAiKeysFromIntegrations` / financial helpers.
 */
export function envAnthropicApiKey(): string {
  return String(process.env.ANTHROPIC_API_KEY || '').trim()
}

export function envOpenaiApiKey(): string {
  return String(process.env.OPENAI_API_KEY || '').trim()
}

export function envGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || '').trim()
}

export function envTelegramBotToken(): string {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
}

export function envExchangeRateApiKey(): string {
  return String(process.env.EXCHANGE_RATE_API_KEY || '').trim()
}

export function envAnthropicModel(): string {
  return String(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022').trim()
}
