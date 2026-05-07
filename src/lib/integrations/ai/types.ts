export type AiAskParams = {
  system: string
  user: string
  max_tokens?: number
  temperature?: number
}

export type AiAskResult = {
  text: string
  model: string
  provider: 'openai' | 'anthropic' | 'gemini'
  inputTokens?: number
  outputTokens?: number
}

export interface AIProvider {
  readonly name: 'openai' | 'anthropic' | 'gemini'
  ask(params: AiAskParams, apiKey: string, model: string): Promise<AiAskResult>
}
