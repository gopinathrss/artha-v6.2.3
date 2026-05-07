export const PROVIDER_KEYS = [
  'ai.openai',
  'ai.anthropic',
  'ai.gemini',
  'comms.smtp',
  'comms.telegram',
  'comms.imap',
  'fx.exchangerate-api'
] as const

export type ProviderKey = (typeof PROVIDER_KEYS)[number]

export type ProviderCategory = 'ai' | 'communications' | 'financial' | 'system'

export type ProviderRegistryEntry = {
  category: ProviderCategory
  label: string
  secretFields: readonly string[]
  /** Non-secret JSON keys with simple types for docs / UI hints */
  configHints: readonly string[]
}

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderRegistryEntry> = {
  'ai.openai': {
    category: 'ai',
    label: 'OpenAI',
    secretFields: ['apiKey'],
    configHints: ['model']
  },
  'ai.anthropic': {
    category: 'ai',
    label: 'Anthropic Claude',
    secretFields: ['apiKey'],
    configHints: ['model']
  },
  'ai.gemini': {
    category: 'ai',
    label: 'Google Gemini',
    secretFields: ['apiKey'],
    configHints: ['model']
  },
  'comms.smtp': {
    category: 'communications',
    label: 'SMTP',
    secretFields: ['password', 'refreshToken', 'oauthClientSecret'],
    configHints: ['host', 'port', 'user', 'fromAddress', 'rejectUnauthorized', 'authMode', 'oauthClientId']
  },
  'comms.telegram': {
    category: 'communications',
    label: 'Telegram Bot',
    secretFields: ['botToken'],
    configHints: ['chatId']
  },
  'comms.imap': {
    category: 'communications',
    label: 'IMAP',
    secretFields: ['password'],
    configHints: ['host', 'port', 'user']
  },
  'fx.exchangerate-api': {
    category: 'financial',
    label: 'ExchangeRate-API',
    secretFields: ['apiKey'],
    configHints: []
  }
}

export function isProviderKey(k: string): k is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(k)
}
