/** How far back `monthYear` (YYYY-MM) may be on write paths. */
export const ALLOWED_MONTH_YEAR_PAST_YEARS = 10
/** How many calendar months ahead `monthYear` may be (from current UTC month). */
export const ALLOWED_MONTH_YEAR_FUTURE_MONTHS = 3

/**
 * Validates `monthYear` for AllocationPlan writes (production paths only).
 * @throws Error with a descriptive message when out of range or malformed.
 */
export function assertValidMonthYear(monthYear: string, now: Date = new Date()): void {
  const m = /^(\d{4})-(\d{2})$/.exec(monthYear.trim())
  if (!m) throw new Error(`Invalid monthYear format: ${monthYear}`)
  const year = parseInt(m[1]!, 10)
  const month = parseInt(m[2]!, 10)
  if (month < 1 || month > 12) throw new Error(`Invalid month in monthYear: ${monthYear}`)

  const minYear = now.getUTCFullYear() - ALLOWED_MONTH_YEAR_PAST_YEARS
  if (year < minYear) {
    throw new Error(
      `monthYear ${monthYear} is more than ${ALLOWED_MONTH_YEAR_PAST_YEARS} years in the past (min year ${minYear})`
    )
  }

  const maxDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  maxDate.setUTCMonth(maxDate.getUTCMonth() + ALLOWED_MONTH_YEAR_FUTURE_MONTHS)
  const maxYear = maxDate.getUTCFullYear()
  const maxMonth = maxDate.getUTCMonth() + 1

  if (year > maxYear || (year === maxYear && month > maxMonth)) {
    throw new Error(
      `monthYear ${monthYear} is more than ${ALLOWED_MONTH_YEAR_FUTURE_MONTHS} months beyond the current UTC month`
    )
  }
}
