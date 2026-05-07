/**
 * One-shot migration: encrypt plaintext secret columns in Settings.
 * Run manually: `npm run migrate:secrets` (not executed on server start).
 */
import { ENVELOPE_PREFIX, setSecret, type SecretsField } from '../src/lib/secrets'
import { getPrisma } from '../src/lib/prisma'

const FIELDS: SecretsField[] = ['smtpPass', 'imapPassword', 'openaiApiKey', 'telegramBotToken']

async function main() {
  const prisma = await getPrisma()
  const s = await prisma.settings.findFirst()
  if (!s) {
    // eslint-disable-next-line no-console
    console.log('[migrate:secrets] No Settings row — nothing to do.')
    return
  }
  for (const field of FIELDS) {
    const raw = (s as Record<string, string | null | undefined>)[field]
    if (raw == null || raw === '') continue
    if (raw.startsWith(ENVELOPE_PREFIX)) {
      // eslint-disable-next-line no-console
      console.log(`[migrate:secrets] ${field}: already encrypted, skip`)
      continue
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate:secrets] ${field}: encrypting plaintext…`)
    await setSecret(field, raw)
  }
  // eslint-disable-next-line no-console
  console.log('[migrate:secrets] Done.')
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
