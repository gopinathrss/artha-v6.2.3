import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AiAskParams, AiAskResult } from './types'

export const anthropicProvider: AIProvider = {
  name: 'anthropic',
  async ask(params: AiAskParams, apiKey: string, model: string): Promise<AiAskResult> {
    // V6: explicit per-request timeout (60s) so a hung provider doesn't pin a Node worker.
    const ac = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })
    const msg = await ac.messages.create({
      model,
      max_tokens: params.max_tokens ?? 800,
      temperature: params.temperature ?? 0.3,
      system: params.system,
      messages: [{ role: 'user', content: params.user }]
    })
    const b = msg.content[0]
    const text = b && b.type === 'text' ? b.text : ''
    const u = msg.usage
    return {
      text,
      model: msg.model,
      provider: 'anthropic',
      inputTokens: u?.input_tokens,
      outputTokens: u?.output_tokens
    }
  }
}
