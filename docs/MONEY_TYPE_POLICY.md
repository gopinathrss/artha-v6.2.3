# Money type policy (F1.1)

## Storage

- Monetary amounts in PostgreSQL are stored as `NUMERIC` via Prisma `Decimal` with per-field precision in `prisma/schema.prisma` (`@db.Decimal(...)`).
- Do not use `Float` / `Double` for money, NAV, FX rates, units, or percentages that participate in portfolio valuation.

## Application code

- **Inside** the app (services, calculators, planners), treat money as `Prisma.Decimal` using `src/lib/money.ts`:
  - `d(value)` — construct a decimal from DB fields, numbers, or strings.
  - `num(value)` — convert to a finite JavaScript `number` only when the algorithm requires native math (e.g. XIRR iteration, `Math.*`, chart coordinates) or for display.
- Prefer `Decimal` methods (`.plus`, `.minus`, `.mul`, `.div`, `.gt`, `.isZero`, …) for amounts that must stay exact through a calculation chain (e.g. net worth, allocation CZK totals, INR→CZK conversion).

## API and JSON

- HTTP responses use JSON numbers, not strings. `src/api/server.ts` wraps `res.json` so any `Prisma.Decimal` embedded in objects is serialized with `serializeJsonBody` (decimal → number) before sending.
- Request bodies may still send plain numbers; Prisma accepts them when writing `Decimal` columns.

## Tests

- Unit tests may pass plain numbers into calculators; production paths also accept `Decimal` from Prisma. Where precision matters, construct inputs with `new Prisma.Decimal('…')` and assert with `toBeCloseTo` or string equality on `d(a).toFixed(n)`.

## Rollback

- Database rollback: restore from `backups/pre-area1.sql` or checkout the `pre-area1` tag per project hardening notes before re-applying a corrected migration.
