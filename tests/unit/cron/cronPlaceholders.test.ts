import { describe, expect, it } from 'vitest'
import { REGISTERED_CRON_JOB_NAMES } from '../../../src/lib/cron/cronPlaceholders'

describe('cron placeholders registry', () => {
  it('includes prune-old-rows and core jobs', () => {
    expect(REGISTERED_CRON_JOB_NAMES).toContain('prune-old-rows')
    expect(REGISTERED_CRON_JOB_NAMES).toContain('morning-job-weekday')
    expect(REGISTERED_CRON_JOB_NAMES.length).toBeGreaterThanOrEqual(16)
  })
})
