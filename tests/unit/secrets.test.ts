import { describe, expect, it } from 'vitest'
import crypto from 'crypto'
import { decrypt, encrypt, ENVELOPE_PREFIX, isSecretStoredSafely, PlaintextSecretError } from '../../src/lib/secrets'

describe('secrets crypto', () => {
  const key = crypto.randomBytes(32)

  it('round-trip encrypt / decrypt', () => {
    const msg = 'hello-secret-ü'
    const env = encrypt(msg, key)
    expect(env.startsWith(ENVELOPE_PREFIX)).toBe(true)
    expect(decrypt(env, key)).toBe(msg)
  })

  it('tampered ciphertext throws', () => {
    const env = encrypt('hello-world-payload', key)
    const b = Buffer.from(env.slice(ENVELOPE_PREFIX.length), 'base64')
    // Flip a byte in the GCM auth tag (indices 12..27) so auth fails reliably.
    b[13] ^= 0xff
    const bad = ENVELOPE_PREFIX + b.toString('base64')
    expect(() => decrypt(bad, key)).toThrow()
  })

  it('wrong key length throws on decrypt path', () => {
    const short = crypto.randomBytes(16)
    const env = encrypt('a', key)
    expect(() => decrypt(env, short)).toThrow()
  })

  it('isSecretStoredSafely', () => {
    expect(isSecretStoredSafely(null)).toBe(true)
    expect(isSecretStoredSafely('')).toBe(true)
    expect(isSecretStoredSafely(`${ENVELOPE_PREFIX}abc`)).toBe(true)
    expect(isSecretStoredSafely('plain')).toBe(false)
  })

  it('PlaintextSecretError has field', () => {
    const e = new PlaintextSecretError('openaiApiKey')
    expect(e.field).toBe('openaiApiKey')
    expect(e.message).toContain('plaintext')
  })
})
