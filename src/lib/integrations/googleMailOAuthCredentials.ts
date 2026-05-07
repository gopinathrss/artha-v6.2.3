import type { Request } from 'express'
import type { PrismaClient } from '@prisma/client'
import { getProviderDecrypted } from './store'
import { envGoogleMailOAuthClientId, envGoogleMailOAuthClientSecret } from './googleMailOAuthEnv'

export type GoogleMailOAuthClientCreds = { clientId: string; clientSecret: string }

/** Prefer OAuth client saved on `comms.smtp` (n8n-style), else env. */
export async function resolveGoogleMailOAuthClientSecrets(
  prisma: PrismaClient
): Promise<GoogleMailOAuthClientCreds | null> {
  const row = await getProviderDecrypted(prisma, 'comms.smtp')
  const idFromCfg = String(row?.config?.oauthClientId || '').trim()
  const secFromDb = String(row?.secrets?.oauthClientSecret || '').trim()
  if (idFromCfg && secFromDb) return { clientId: idFromCfg, clientSecret: secFromDb }
  const eId = envGoogleMailOAuthClientId()
  const eSec = envGoogleMailOAuthClientSecret()
  if (eId && eSec) return { clientId: eId, clientSecret: eSec }
  return null
}
