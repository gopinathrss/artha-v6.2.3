# V5.1 Hardening — Area 3 — Plan Integrity & Lessons

## Status: PARTIAL (code landed; local gates require your machine)

Area 3 implementation is in the repo (schema, dual-write, guards, schema validators, tax-window setting, docs, SQL cleanup script, tests). **This Cursor environment did not have `npx` on PATH**, so **GATE A/B and P0.4 were not re-executed here.** Run `npx tsc --noEmit` and `ARTHA_TEST_DB_LIVE=1 npx vitest run` on your workstation before tagging `v51-area3-complete`.

## Pre-flight checks

| Check | Result (this session) |
|--------|------------------------|
| P0.1 `git describe` → `v51-area2-complete` | Not run (no git verification in sandbox) |
| P0.2 `Account.balanceCzkSnapshot` | Not run |
| P0.3 `/api/overview` shape | Not run |
| P0.4 vitest baseline | Blocked (`npx` unavailable) |

## Findings closed (intended)

| ID | Item |
|----|------|
| F12.3 | `assertValidMonthYear` in `src/lib/allocationPlanGuards.ts` on `generateMonthlyPlan`; cleanup SQL `scripts/area3-cleanup-far-future-plans.sql`; API test `this-month.test.ts` uses `futureMonth(2)` instead of `2030-*`. |
| F1.1 | `AllocationPlanRow` + `PlanRowKind`; dual-write via `replacePlanRows` in same transaction as plan create/update; `parseAllocationsJsonStrict` / `parsePlanAllocations` in `src/lib/allocationPlanSchema.ts` (strict validators, no Zod package — see note below). |
| F3.3 | `Settings.taxFreeWindowAllowsBuy` default `false`; planner omits reduced BUY in 90d window unless override; dashboard settings toggle. |
| F3.2 | Transactional `extractLesson(..., tx)` + regen story; **DB DELETE/regenerate (T6) is manual** — run `scripts/area3-cleanup-far-future-plans.sql` then `POST /api/this-month/generate-now` after backup. |

## Zod vs strict TS validators

The sprint brief asked for `zod`; the codebase uses **hand-written strict checks** in `allocationPlanSchema.ts` (equivalent goals: validate on write, strict + legacy fallback on read). To match the brief literally, add the `zod` dependency and swap implementations when `npm install` works.

## Architectural changes

- **Table:** `AllocationPlanRow` (cascade delete from `AllocationPlan`), `@@unique([planId, orderIndex])`.
- **Enum:** `PlanRowKind` (`BUY` | `SELL` | `HOLD` | `RESERVE`).
- **Settings:** `taxFreeWindowAllowsBuy Boolean @default(false)`.
- **Writer:** `generateMonthlyPlan` — `assertValidMonthYear` → create plan → lessons → update JSON → `replacePlanRows` in one `$transaction`.
- **Row sync:** `planRowUpdate.ts`, `followThrough.ts`, `cfoRoutes.ts` (row PATCH) call `replacePlanRows` after JSON changes.

## Migrations

- `prisma/migrations/20260504110000_v51_area3_allocation_plan_row__typed_rows_and_tax_flag/migration.sql` — apply with `npx prisma migrate deploy` on **real + demo** DBs, then `npx prisma generate`.

## Files created (this continuation)

- `tests/unit/allocationPlanGuards.test.ts`
- `tests/unit/allocationPlanSchema.test.ts`
- `tests/unit/allocationPlanner/taxWindow.test.ts`
- `tests/integration/allocationPlanWrite.test.ts` (`skipIf` unless `ARTHA_TEST_DB_LIVE=1`)
- `tests/integration/lessonNarrative.test.ts` (placeholder — extend with seeded `HistoricalNavStats` + `generateMonthlyPlan` when CI data is stable)
- `scripts/area3-cleanup-far-future-plans.sql`

## Files modified (this continuation)

- `docs/METHODOLOGY.md` — Plan storage model, tax-free window, monthYear guard.
- `tests/api/this-month.test.ts` — valid `monthYear` for guarded `generate-now`.
- `tests/unit/allocationPlanner.test.ts` — cases 8a, 8c (F3.3 coverage).

## Manual steps you still owe (T0/T6)

1. `pg_dump` real + demo → `backups/pre-v51-area3.sql` (+ demo), `git tag pre-v51-area3`.
2. Run baseline captures (psql/curl) as in sprint brief.
3. After backup: run `scripts/area3-cleanup-far-future-plans.sql`, then `POST .../generate-now`.
4. Verify BUY reasons for lesson ISINs; verify `jsonb_array_length(allocations)` equals `COUNT(AllocationPlanRow)` for current month.

## Tests added (inventory)

| File | Role |
|------|------|
| `allocationPlanGuards.test.ts` | UTC-boundary cases for `assertValidMonthYear` |
| `allocationPlanSchema.test.ts` | Strict parse + wrapped `{ schemaVersion, rows }` + legacy fallback |
| `allocationPlanner/taxWindow.test.ts` | `calculateTaxStatus` vs 80d / 200d / past window |
| `allocationPlanner.test.ts` | 8, 8a, 8b, 8c — planner BUY/HOLD behaviour |
| `allocationPlanWrite.test.ts` | Dual-write + executionStatus sync (live DB) |
| `lessonNarrative.test.ts` | Placeholder |

## Rollback

See sprint brief: `git reset --hard pre-v51-area3`, `pg_restore` from `backups/pre-v51-area3.sql`.

## Recommendations for Area 4

Unchanged from brief (F10.1, F11.x, F6.x, F8.1, F4.1, F9.x, F12.2). Optional: add **read-path** `parsePlanAllocations` to `buildReportData`, `telegram/bot`, `planEmail`, `adherence`, `health`, `aiIntelligence` where allocations are still cast loosely — improves corrupt-JSON detection (T4.3 stretch).
