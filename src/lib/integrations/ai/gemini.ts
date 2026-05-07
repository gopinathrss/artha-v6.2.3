import axios from 'axios'
import type { AIProvider, AiAskParams, AiAskResult } from './types'

export const geminiProvider: AIProvider = {
  name: 'gemini',
  async ask(params: AiAskParams, apiKey: string, model: string): Promise<AiAskResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    const { data } = await axios.post(
      url,
      {
        contents: [{ role: 'user', parts: [{ text: `${params.system}\n\n${params.user}` }] }],
        generationConfig: {
          maxOutputTokens: params.max_tokens ?? 800,
          temperature: params.temperature ?? 0.3
        }
      },
      { params: { key: apiKey }, timeout: 60_000 }
    )
    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text || '').join('') : ''
    return {
      text,
      model,
      provider: 'gemini',
      inputTokens: data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount
    }
  }
}
