/**
 * Idempotent: copy legacy Settings secrets into IntegrationProvider JSON (encrypted)
 * and ensure AppSettings row exists. Safe to run twice.
 */
import { realPrisma } from '../src/lib/prisma'
import { ensureAppSettings } from '../src/lib/appSettingsMerge'
import { upsertIntegrationProvider } from '../src/lib/integrations/store'
import { getSecret } from '../src/lib/secrets'

async function main() {
  await ensureAppSettings(realPrisma)
  const s = await realPrisma.settings.findFirst()
  if (!s) {
    console.log('No Settings row — nothing to migrate.')
    return
  }

  const openai = await getSecret('openaiApiKey').catch(() => null)
  if (openai) {
    await upsertIntegrationProvider(realPrisma, 'ai.openai', {
      enabled: true,
      secrets: { apiKey: openai },
      config: { model: 'gpt-4o' }
    })
    console.log('Migrated OpenAI → ai.openai')
  }

  const tg = await getSecret('telegramBotToken').catch(() => null)
  if (tg) {
    await upsertIntegrationProvider(realPrisma, 'comms.telegram', {
      enabled: true,
      secrets: { botToken: tg },
      config: { chatId: s.telegramChatId || '' }
    })
    console.log('Migrated Telegram → comms.telegram')
  }

  const smtpPass = await getSecret('smtpPass').catch(() => null)
  if (smtpPass && s.smtpUser) {
    await upsertIntegrationProvider(realPrisma, 'comms.smtp', {
      enabled: true,
      secrets: { password: smtpPass },
      config: {
        host: s.smtpHost,
        port: s.smtpPort,
        user: s.smtpUser,
        fromAddress: s.smtpUser,
        rejectUnauthorized: false
      }
    })
    console.log('Migrated SMTP → comms.smtp')
  }

  const imapPass = await getSecret('imapPassword').catch(() => null)
  if (imapPass && s.imapUser) {
    await upsertIntegrationProvider(realPrisma, 'comms.imap', {
      enabled: Boolean(s.autoIngestEmails),
      secrets: { password: imapPass },
      config: { host: s.imapHost, port: s.imapPort ?? 993, user: s.imapUser }
    })
    console.log('Migrated IMAP → comms.imap')
  }

  console.log('Done.')
  await realPrisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
