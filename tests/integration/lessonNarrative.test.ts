import './testEnv'
import { describe, expect, it } from 'vitest'
import { hasTestDatabase } from '../api/helpers'

/**
 * Full lesson narrative requires HistoricalNavStats + generate-now on a live DB.
 * Run with ARTHA_TEST_DB_LIVE=1 after seeding stats for a known ISIN.
 */
describe.skipIf(!hasTestDatabase())('integration: BUY lesson narrative (F3.2 regression)', () => {
  it('placeholder — extend when stable seed ISIN + stats exist in CI', () => {
    expect(true).toBe(true)
  })
})
