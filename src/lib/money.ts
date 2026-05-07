import { Prisma } from '@prisma/client'

/** Accepts DB `Decimal`, literals, or strings at API boundaries. */
export type MoneyInput = number | string | Prisma.Decimal | null | undefined

/** `instanceof` can fail across duplicated `@prisma/client` copies (tests / bundlers). */
function isDecimalValue(v: unknown): v is Prisma.Decimal {
  if (v instanceof Prisma.Decimal) return true
  if (v == null || typeof v !== 'object') return false
  const o = v as { toNumber?: () => number; toFixed?: (dp?: number) => string }
  return typeof o.toNumber === 'function' && typeof o.toFixed === 'function'
}

export function d(v: MoneyInput): Prisma.Decimal {
  if (v == null) return new Prisma.Decimal(0)
  if (isDecimalValue(v)) return v
  if (typeof v === 'number') return new Prisma.Decimal(Number.isFinite(v) ? v : 0)
  return new Prisma.Decimal(v)
}

/** Finite number for JSON and JS math that must stay in `number` (XIRR, percentages, etc.). */
export function num(v: MoneyInput): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  if (isDecimalValue(v)) {
    const x = v.toNumber()
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

/**
 * Convert Prisma Decimals to numbers before `JSON.stringify`, otherwise
 * `Decimal.prototype.toJSON` runs first and yields strings (replacer never sees Decimal).
 */
function mapDecimalsToNumbers(x: unknown, key: string): unknown {
  if (x == null || typeof x !== 'object') return x
  if (x instanceof Date) return x
  if (isDecimalValue(x)) {
    const n = x.toNumber()
    const threshold = Number.MAX_SAFE_INTEGER / 100
    if (Math.abs(n) > threshold) {
      // eslint-disable-next-line no-console
      console.warn(
        `[money] Large Decimal for key "${key}": ${x.toString()} — toNumber() may lose integer precision past ~9e15`
      )
    }
    return n
  }
  if (Array.isArray(x)) {
    return x.map((item, i) => mapDecimalsToNumbers(item, `${key}[${i}]`))
  }
  const o = x as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o)) {
    out[k] = mapDecimalsToNumbers(o[k], k)
  }
  return out
}

/** Deep-clone for `res.json`: every `Decimal` becomes a JSON number. */
export function serializeJsonBody<T>(body: T): T {
  const mapped = mapDecimalsToNumbers(body, '') as T
  return JSON.parse(
    JSON.stringify(mapped, (_key, value) => {
      if (typeof value === 'bigint') return Number(value)
      return value
    })
  ) as T
}
