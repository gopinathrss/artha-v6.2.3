import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import type { Prisma } from '@prisma/client'
import { getPrisma } from './prisma'

export const ENVELOPE_PREFIX = 'enc:v1:' as const

export type SecretsField = 'smtpPass' | 'imapPassword' | 'openaiApiKey' | 'telegramBotToken'

export class PlaintextSecretError extends Error {
  readonly field: SecretsField
  constructor(field: SecretsField) {
    super(
      `Secret field "${field}" is stored as plaintext. ` +
        `Open Settings and re-save to encrypt. ` +
        `This call is now blocked for security.`
    )
    this.name = 'PlaintextSecretError'
    this.field = field
  }
}

export function secretKeyfilePath(): string {
  if (process.env.PIE_SECRET_KEY_PATH?.trim()) {
    return path.resolve(process.env.PIE_SECRET_KEY_PATH.trim())
  }
  if (process.env.ARTHA_SECRET_KEY_PATH?.trim()) {
    return path.resolve(process.env.ARTHA_SECRET_KEY_PATH.trim())
  }
  const base = process.env.APPDATA || process.env.LOCALAPPDATA || os.homedir()
  return path.join(base, 'artha', 'secret.key')
}

/** Exported for V5.2 IntegrationProvider JSON secret encryption (same keyfile as Settings). */
export function loadOrCreateKey(): Buffer {
  const KEYFILE_PATH = secretKeyfilePath()
  const dir = path.dirname(KEYFILE_PATH)
  if (fs.existsSync(KEYFILE_PATH)) {
    const buf = fs.readFileSync(KEYFILE_PATH)
    if (buf.length !== 32) {
      throw new Error(`Secret keyfile at ${KEYFILE_PATH} must be exactly 32 bytes (got ${buf.length})`)
    }
    return buf
  }
  fs.mkdirSync(dir, { recursive: true })
  const key = crypto.randomBytes(32)
  const tmp = `${KEYFILE_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, key)
  fs.renameSync(tmp, KEYFILE_PATH)
  // eslint-disable-next-line no-console
  console.warn(`[pie] Generated new secret key at ${KEYFILE_PATH}`)
  // eslint-disable-next-line no-console
  console.warn('[pie] Back up this file. Losing it makes stored secrets unrecoverable.')
  return key
}

async function logPlaintextSecret(field: SecretsField): Promise<void> {
  try {
    const prisma = await getPrisma()
    await prisma.systemHealth.create({
      data: {
        checkName: 'SECRETS',
        status: 'WARN',
        message: `Plaintext secret detected: ${field}`,
        metadata: { field } as object
      }
    })
  } catch {
    /* */
  }
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, enc])
  return ENVELOPE_PREFIX + combined.toString('base64')
}

export function decrypt(envelope: string, key: Buffer): string {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('Invalid envelope: missing enc:v1: prefix')
  }
  const raw = Buffer.from(envelope.slice(ENVELOPE_PREFIX.length), 'base64')
  if (raw.length < 12 + 16 + 1) {
    throw new Error('Invalid envelope: truncated payload')
  }
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function readField(
  row: Record<string, string | null | undefined>,
  name: SecretsField
): string | null {
  const v = row[name]
  if (v == null || v === '') return null
  return String(v)
}

export async function getSecret(
  name: SecretsField,
  tx?: Prisma.TransactionClient
): Promise<string | null> {
  const key = loadOrCreateKey()
  const prisma = tx ?? (await getPrisma())
  const s = await prisma.settings.findFirst()
  if (!s) return null
  const row = s as unknown as Record<string, string | null | undefined>
  const raw = readField(row, name)
  if (raw == null) return null
  if (raw.startsWith(ENVELOPE_PREFIX)) {
    try {
      return decrypt(raw, key)
    } catch {
      throw new Error('Decryption failed: key mismatch or tampered ciphertext')
    }
  }
  await logPlaintextSecret(name)
  throw new PlaintextSecretError(name)
}

export async function setSecret(
  name: SecretsField,
  value: string | null,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const prisma = tx ?? (await getPrisma())
  const s = await prisma.settings.findFirst()
  if (!s) throw new Error('Settings row missing — cannot persist secret')
  const key = loadOrCreateKey()
  const data: Record<string, string | null> = {}
  if (value == null || value === '') {
    data[name] = null
  } else {
    data[name] = encrypt(value, key)
  }
  await prisma.settings.update({ where: { id: s.id }, data: data as never })
}

/** For health / UI: true if value is null or AES envelope (not legacy plaintext). */
export function isSecretStoredSafely(v: string | null | undefined): boolean {
  if (v == null || v === '') return true
  return v.startsWith(ENVELOPE_PREFIX)
}
