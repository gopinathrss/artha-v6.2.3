import OpenAI from 'openai'
import type { AIProvider, AiAskParams, AiAskResult } from './types'

export const openaiProvider: AIProvider = {
  name: 'openai',
  async ask(params: AiAskParams, apiKey: string, model: string): Promise<AiAskResult> {
    // V6: explicit per-request timeout (60s) so a hung provider doesn't pin a Node worker.
    const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 })
    const res = await client.chat.completions.create({
      model,
      max_tokens: params.max_tokens ?? 800,
      temperature: params.temperature ?? 0.3,
      messages: [
        { role: 'system', content: params.system + '\nRespond as raw JSON only when asked.' },
        { role: 'user', content: params.user }
      ]
    })
    const text = res.choices[0]?.message?.content ?? ''
    return {
      text,
      model: res.model,
      provider: 'openai',
      inputTokens: res.usage?.prompt_tokens,
      outputTokens: res.usage?.completion_tokens
    }
  }
}
