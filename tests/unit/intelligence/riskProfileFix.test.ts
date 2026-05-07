import { describe, expect, it } from 'vitest'
import { mergeRiskProfileLayers } from '../../../src/lib/appSettingsMerge'

describe('mergeRiskProfileLayers (V6.2.2 Area 2)', () => {
  it('UserProfile / Finances risk wins over AppSettings and legacy Settings', () => {
    expect(mergeRiskProfileLayers('MODERATE', 'CONSERVATIVE', 'CONSERVATIVE')).toBe('MODERATE')
  })

  it('falls back to AppSettings when UserProfile is empty', () => {
    expect(mergeRiskProfileLayers(undefined, 'AGGRESSIVE', 'CONSERVATIVE')).toBe('AGGRESSIVE')
    expect(mergeRiskProfileLayers('   ', 'MODERATE', 'CONSERVATIVE')).toBe('MODERATE')
  })

  it('falls back to legacy Settings when UserProfile and App are empty', () => {
    expect(mergeRiskProfileLayers(null, null, 'CONSERVATIVE')).toBe('CONSERVATIVE')
  })

  it('defaults to MODERATE when all missing', () => {
    expect(mergeRiskProfileLayers(null, null, null)).toBe('MODERATE')
  })
})
