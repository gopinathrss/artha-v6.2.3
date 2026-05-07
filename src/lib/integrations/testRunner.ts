import axios from 'axios'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { PrismaClient } from '@prisma/client'
import { getProviderDecrypted } from './store'
import { envAnthropicApiKey, envGeminiApiKey } from './env-fallback'
import { writeIntegrationStatus } from './status'
import type { ProviderKey } from './registry'
import { verifyGmailOAuthRefreshToken } from './communications/gmailApiMail'
import { resolveGoogleMailOAuthClientSecrets } from './googleMailOAuthCredentials'
import {
  createGmailSmtpTransportAttempts,
  createSmtpTransport,
  isGmailSubmissionHost,
  normalizeSmtpHost
} from './communications/smtp'

export type TestResult = { status: 'OK' | 'FAIL' | 'WARN'; latencyMs: number; message: string }

export async function runIntegrationProviderTest(prisma: PrismaClient, key: ProviderKey): Promise<TestResult> {
  const t0 = Date.now()
  const done = async (status: TestResult['status'], message: string) => {
    const latencyMs = Date.now() - t0
    await writeIntegrationStatus(prisma, { providerKey: key, status, source: 'test', message, latencyMs })
    return { status, latencyMs, message }
  }
  try {
    const row = await prisma.integrationProvider.findUnique({ where: { key } })
    const dec = await getProviderDecrypted(prisma, key)
    if (!dec) return await done('FAIL', 'Provider not found')

    const isAi = key.startsWith('ai.')
    if (!isAi && !row?.enabled) return await done('WARN', 'Provider disabled — enable before testing')

    if (key === 'ai.openai') {
      const k = dec.secrets.apiKey
      if (!k) return await done('FAIL', 'Missing apiKey')
      const client = new OpenAI({ apiKey: k })
      await client.chat.completions.create({
        model: String(dec.config?.model || 'gpt-4o'),
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }]
      })
      return await done('OK', 'OpenAI responded')
    }
    if (key === 'ai.anthropic') {
      const k = dec.secrets.apiKey || envAnthropicApiKey()
      if (!k) return await done('FAIL', 'Missing apiKey (save in Settings or set ANTHROPIC_API_KEY)')
      const ac = new Anthropic({ apiKey: k })
      await ac.messages.create({
        model: String(dec.config?.model || 'claude-sonnet-4-5'),
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
      return await done('OK', 'Anthropic responded')
    }
    if (key === 'ai.gemini') {
      const k = dec.secrets.apiKey || envGeminiApiKey()
      if (!k) return await done('FAIL', 'Missing apiKey (save in Settings or set GEMINI_API_KEY)')
      const model = String(dec.config?.model || 'gemini-1.5-flash')
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      await axios.post(url, { contents: [{ parts: [{ text: 'ping' }] }] }, { params: { key: k }, timeout: 15_000 })
      return await done('OK', 'Gemini responded')
    }
    if (key === 'fx.exchangerate-api') {
      const k = dec.secrets.apiKey
      if (!k) return await done('FAIL', 'Missing apiKey')
      const r = await axios.get(`https://v6.exchangerate-api.com/v6/${k}/pair/EUR/USD`, { timeout: 10_000 })
      if (typeof r.data?.conversion_rate !== 'number') return await done('FAIL', 'Unexpected API response')
      return await done('OK', 'ExchangeRate-API OK')
    }
    if (key === 'comms.smtp') {
      const pass = dec.secrets.password
      const refreshToken = dec.secrets.refreshToken
      const host = String(dec.config?.host || 'smtp.gmail.com')
      const port = Number(dec.config?.port || 587)
      const user = String(dec.config?.user || '')
      if (refreshToken) {
        const oauthCreds = await resolveGoogleMailOAuthClientSecrets(prisma)
        if (oauthCreds) {
          try {
            await verifyGmailOAuthRefreshToken(refreshToken, oauthCreds)
            return await done('OK', 'Gmail OAuth (HTTPS) — token and userinfo OK')
          } catch (e: unknown) {
            return await done('FAIL', e instanceof Error ? e.message : String(e))
          }
        }
        return await done(
          'FAIL',
          'Gmail refresh token saved but OAuth Client ID + Client Secret are missing — add them under Gmail OAuth2 API on this card (or set PIE_GOOGLE_OAUTH_* env).'
        )
      }
      if (!user || !pass) return await done('FAIL', 'SMTP user/password missing')
      const rejectUnauthorized = dec.config?.rejectUnauthorized !== false
      const hNorm = normalizeSmtpHost(host)
      if (isGmailSubmissionHost(hNorm)) {
        const attempts = await createGmailSmtpTransportAttempts({ user, password: pass, rejectUnauthorized })
        const parts: string[] = []
        for (const { transport, label } of attempts) {
          try {
            await transport.verify()
            return await done('OK', `SMTP verify OK (${label})`)
          } catch (e: unknown) {
            parts.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        return await done('FAIL', parts.join(' · ') || 'Gmail SMTP verify failed')
      }
      const transporter = createSmtpTransport({
        host,
        port,
        user,
        password: pass,
        rejectUnauthorized
      })
      await transporter.verify()
      return await done('OK', 'SMTP verify OK')
    }
    if (key === 'comms.telegram') {
      const token = dec.secrets.botToken
      let chatId = String(dec.config?.chatId || '').trim()
      if (!chatId) {
        const st = await prisma.settings.findFirst()
        chatId = String(st?.telegramChatId || '').trim()
      }
      if (!token) return await done('FAIL', 'Missing botToken')
      const me = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10_000 })
      if (!me.data?.ok) return await done('FAIL', 'getMe failed')
      if (!chatId) return await done('WARN', 'getMe OK — set chatId to send a test message')
      const botUsername = (me.data?.result as { username?: string } | undefined)?.username
      const chatNorm = chatId.replace(/^@/, '').toLowerCase()
      if (botUsername && chatNorm === botUsername.toLowerCase()) {
        return await done(
          'FAIL',
          `Chat ID must be your user or group id, not the bot's @${botUsername}. Open the bot in Telegram, send /start (PIE saves your id), or paste your numeric chat id (digits only, e.g. from @userinfobot).`
        )
      }
      const send = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: chatId, text: 'PIE integration test' },
        { timeout: 15_000, validateStatus: () => true }
      )
      const desc = (send.data as { description?: string; ok?: boolean } | undefined)?.description
      if (!send.data?.ok) {
        const hint =
          /chat not found|chat_id is empty|wrong|PEER_ID|400/i.test(String(desc || ''))
            ? ' — Use a numeric chat id: open your bot, send /start, then Save again (or ask @userinfobot while replying to a message from your bot).'
            : ''
        return await done('FAIL', `${desc || `HTTP ${send.status}`}${hint}`)
      }
      return await done('OK', 'Telegram getMe + sendMessage OK')
    }
    return await done('WARN', 'No automated test for this provider yet')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const latencyMs = Date.now() - t0
    await writeIntegrationStatus(prisma, {
      providerKey: key,
      status: 'FAIL',
      source: 'test',
      message: msg,
      latencyMs
    })
    return { status: 'FAIL', latencyMs, message: msg }
  }
}
