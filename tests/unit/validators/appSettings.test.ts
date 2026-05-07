import { describe, expect, it } from 'vitest'
import { validateAppSettingsPatch } from '../../../src/lib/validators/appSettings'

describe('validateAppSettingsPatch', () => {
  it('accepts valid allocation sum', () => {
    expect(
      validateAppSettingsPatch({
        targetEquityPct: 60,
        targetBondsPct: 30,
        targetCashPct: 10
      })
    ).toBeNull()
  })

  it('rejects sum not 100', () => {
    const e = validateAppSettingsPatch({
      targetEquityPct: 60,
      targetBondsPct: 30,
      targetCashPct: 9
    })
    expect(e?.message).toContain('100')
  })

  it('accepts themeMode', () => {
    expect(validateAppSettingsPatch({ themeMode: 'DARK' })).toBeNull()
  })

  it('rejects bad theme', () => {
    expect(validateAppSettingsPatch({ themeMode: 'FOO' })?.field).toBe('themeMode')
  })

  it('accepts defaultAiProviderKey for known AI integrations', () => {
    expect(validateAppSettingsPatch({ defaultAiProviderKey: 'ai.openai' })).toBeNull()
  })

  it('rejects unknown defaultAiProviderKey', () => {
    expect(validateAppSettingsPatch({ defaultAiProviderKey: 'ai.fake' })?.field).toBe('defaultAiProviderKey')
  })
})
