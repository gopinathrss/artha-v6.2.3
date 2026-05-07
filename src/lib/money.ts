import { Prisma } from '@prisma/client'

/** Accepts DB `Decimal`, literals, or strings at API boundaries. */
export type MoneyInput = number | string | Prisma.Decimal | null | undefined

export function d(v: MoneyInput): Prisma.Decimal {
  if (v == null) return new Prisma.Decimal(0)
  if (v instanceof Prisma.Decimal) return v
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
  if (v instanceof Prisma.Decimal) {
    const x = v.toNumber()
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

/** Deep-clone for `res.json`: every `Decimal` becomes a JSON number. */
export function serializeJsonBody<T>(body: T): T {
  return JSON.parse(
    JSON.stringify(body, (_key, value) => {
      if (value instanceof Prisma.Decimal) return value.toNumber()
      if (typeof value === 'bigint') return Number(value)
      return value
    })
  ) as T
}
