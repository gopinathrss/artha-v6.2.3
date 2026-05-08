export type InterestTier = {
  upTo?: number
  above?: number
  ratePct: number
}

export type InterestTierValidationError = {
  index: number
  message: string
}

export function validateInterestTiers(
  tiers: unknown
): { valid: true; tiers: InterestTier[] } | { valid: false; errors: InterestTierValidationError[] } {
  if (!Array.isArray(tiers)) {
    return { valid: false, errors: [{ index: -1, message: 'Must be an array' }] }
  }
  if (tiers.length === 0) {
    // Empty array is valid — means "no tier data"
    return { valid: true, tiers: [] }
  }

  const errors: InterestTierValidationError[] = []
  const validated: InterestTier[] = []

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    if (typeof t !== 'object' || t === null) {
      errors.push({ index: i, message: 'Each tier must be an object' })
      continue
    }
    const tier = t as Record<string, unknown>

    // ratePct must be a finite number
    if (typeof tier.ratePct !== 'number' || !isFinite(tier.ratePct)) {
      errors.push({ index: i, message: `ratePct must be a finite number, got: ${String(tier.ratePct)}` })
      continue
    }
    if (tier.ratePct < 0 || tier.ratePct > 100) {
      errors.push({ index: i, message: `ratePct must be 0-100, got: ${tier.ratePct}` })
      continue
    }

    // Must have exactly one of: upTo, above
    const hasUpTo = 'upTo' in tier && tier.upTo !== undefined
    const hasAbove = 'above' in tier && tier.above !== undefined
    if (hasUpTo === hasAbove) {
      errors.push({ index: i, message: 'Each tier must have exactly one of: upTo, above' })
      continue
    }

    const boundary = hasUpTo ? tier.upTo : tier.above
    if (typeof boundary !== 'number' || !isFinite(boundary) || boundary < 0) {
      errors.push({ index: i, message: `${hasUpTo ? 'upTo' : 'above'} must be a non-negative number` })
      continue
    }

    validated.push({
      ...(hasUpTo ? { upTo: boundary as number } : {}),
      ...(hasAbove ? { above: boundary as number } : {}),
      ratePct: tier.ratePct as number
    })
  }

  if (errors.length > 0) return { valid: false, errors }
  return { valid: true, tiers: validated }
}

export function parseInterestTiersJson(raw: unknown): InterestTier[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    const result = validateInterestTiers(raw)
    if (!result.valid) {
      // eslint-disable-next-line no-console
      console.warn('[interestTiers] Invalid tier data, ignoring:', result.errors)
      return []
    }
    return result.tiers
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (!Array.isArray(p)) return []
      const result = validateInterestTiers(p)
      if (!result.valid) {
        // eslint-disable-next-line no-console
        console.warn('[interestTiers] Invalid tier data, ignoring:', result.errors)
        return []
      }
      return result.tiers
    } catch {
      return []
    }
  }
  return []
}

/**
 * Annual interest (nominal CZK/year) for `balanceCzk` given tier rows in document order.
 * Typical pattern: `[{ upTo: 400_000, ratePct: 3 }, { above: 400_000, ratePct: 0.01 }]`.
 */
export function computeAnnualInterest(balanceCzk: number, tiers: InterestTier[]): number {
  if (!tiers || tiers.length === 0 || balanceCzk <= 0) return 0
  let total = 0
  for (const tier of tiers) {
    if (tier.upTo !== undefined) {
      const applicable = Math.min(balanceCzk, tier.upTo)
      if (applicable > 0) {
        total += applicable * (tier.ratePct / 100)
      }
    } else if (tier.above !== undefined) {
      const applicable = Math.max(0, balanceCzk - tier.above)
      if (applicable > 0) {
        total += applicable * (tier.ratePct / 100)
      }
    }
  }
  return total
}

export function effectiveRatePct(balanceCzk: number, tiers: InterestTier[]): number {
  if (balanceCzk <= 0) return 0
  const interest = computeAnnualInterest(balanceCzk, tiers)
  return (interest / balanceCzk) * 100
}

/** Rate that applies to the last CZK of balance (marginal / “next euro” tier). */
export function marginalRatePct(balanceCzk: number, tiers: InterestTier[]): number {
  if (!tiers || tiers.length === 0 || balanceCzk <= 0) return 0
  for (const tier of [...tiers].reverse()) {
    if (tier.above !== undefined && balanceCzk > tier.above) {
      return tier.ratePct
    }
    if (tier.upTo !== undefined && balanceCzk <= tier.upTo) {
      return tier.ratePct
    }
  }
  return tiers[tiers.length - 1]?.ratePct ?? 0
}

/** Largest `upTo` among high-rate intro tiers — used as “optimal cap” anchor. */
export function optimalCapCzk(tiers: InterestTier[]): number | null {
  if (!tiers || tiers.length === 0) return null
  const upToTiers = tiers.filter((t) => t.upTo !== undefined)
  if (upToTiers.length === 0) return null
  return Math.max(...upToTiers.map((t) => t.upTo!))
}

export function computeSleepingAmount(
  balanceCzk: number,
  tiers: InterestTier[],
  inflationPct: number,
  emergencyFundCzk = 0
): {
  sleepingCzk: number
  sleepingRatePct: number
  annualRealLossCzk: number
  breakdown: string
} {
  const cap = optimalCapCzk(tiers)
  const protectedAmount = Math.max(emergencyFundCzk, cap ?? 0)
  const sleepingCzk = Math.max(0, balanceCzk - protectedAmount)

  if (sleepingCzk <= 0) {
    return {
      sleepingCzk: 0,
      sleepingRatePct: 0,
      annualRealLossCzk: 0,
      breakdown: 'All balance within optimal rate tier or emergency reserve'
    }
  }

  const sleepingRate = marginalRatePct(balanceCzk, tiers)
  const nominalEarnings = sleepingCzk * (sleepingRate / 100)
  const inflationCost = sleepingCzk * (inflationPct / 100)
  const annualRealLossCzk = Math.max(0, inflationCost - nominalEarnings)

  const breakdown =
    `${Math.round(sleepingCzk).toLocaleString('cs-CZ')} Kč earning ${sleepingRate.toFixed(2)}% ` +
    `vs ${inflationPct}% inflation → losing ` +
    `${Math.round(annualRealLossCzk).toLocaleString('cs-CZ')} Kč/year in real value`

  return { sleepingCzk, sleepingRatePct: sleepingRate, annualRealLossCzk, breakdown }
}
