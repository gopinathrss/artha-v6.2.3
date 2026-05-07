import OpenAI from 'openai'
import { realPrisma } from '../prismaProvider'
import { getSecret } from '../secrets'
import { getProviderDecrypted } from '../integrations/store'
import { envOpenaiApiKey } from '../integrations/env-fallback'

function fallback(maxSentences: number): string {
  const parts = [
    'Portfolio metrics below are computed from your live PIE database.',
    'Enable an OpenAI API key in Settings for a richer executive narrative on future runs.',
    'Review allocation drift and adherence before acting on any single number.'
  ]
  return parts.slice(0, Math.max(1, maxSentences)).join(' ')
}

export async function aiExecutiveSummary(prompt: string, maxSentences: number): Promise<string> {
  const s = await realPrisma.settings.findFirst()
  let key = envOpenaiApiKey()
  const integ = await getProviderDecrypted(realPrisma, 'ai.openai').catch(() => null)
  if (integ?.secrets?.apiKey) key = integ.secrets.apiKey.trim()
  try {
    const sk = s ? await getSecret('openaiApiKey') : null
    if (sk) key = sk.trim()
  } catch {
    /* plaintext blocked — env / integration only */
  }
  if (!key) return fallback(maxSentences)
  try {
    const client = new OpenAI({ apiKey: key })
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You write concise CFO report summaries. Exactly ${maxSentences} sentences. Plain English, no markdown, no bullet characters.`
        },
        { role: 'user', content: prompt.slice(0, 12_000) }
      ],
      temperature: 0.35,
      max_tokens: 400
    })
    const t = res.choices[0]?.message?.content?.trim()
    if (t) return t
  } catch {
    /* network / quota */
  }
  return fallback(maxSentences)
}
