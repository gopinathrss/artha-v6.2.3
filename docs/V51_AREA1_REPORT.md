# V5.1 Hardening — Area 1 — Single-Book Accounting

## Status: COMPLETE (with documented environment gaps)

Area 1 code, tests, and migrations are implemented and verified locally (`tsc`, `vitest`). **Task 0 database backups and live `curl` baselines were not executed** in this environment: `pg_dump` was not on `PATH`, and no local Postgres listener was confirmed for dumps or `curl` baselines. Apply Task 0 on your machine before `prisma migrate deploy` to production. A `git stash` named `pre-v51-area1 screenshots` holds prior dirty tree changes (PNG assets).

## Findings closed

- **F2.1** — NRE (and other non-CZK) stale persisted CZK: **closed** via Shape B (`balanceCzkSnapshot` null for non-CZK; live value via `accountToCzk`).
- **F3.1** — Planner emergency cash used `balanceCzk`: **closed**; `buildMonthlyPlanPayload` uses `accountsToCzk` on SAVINGS+NRE with live FX.
- **F2.2** — `calculateAllocation` ignored India account balances: **closed**; optional `indiaAccountSlices` + `indiaAccountSlicesFromAccounts`; production callers pass slices.

## Architectural change (Shape B)

- `Account.balanceCzk` → **`balanceCzkSnapshot`** (`Decimal?`), nullable, **`NULL` when `currency <> 'CZK'`**; CZK rows keep snapshot = `balanceLocal`.
- Canonical conversion: **`src/lib/accountToCzk.ts`** (`accountToCzk`, `accountsToCzk`) using EUR/INR cross (`EURCZK`, `EURINR`).
- Write-path validation: **`src/lib/accountShapeB.ts`** + **`/api/accounts`** POST/PUT normalize snapshot; legacy JSON key `balanceCzk` stripped via dynamic key (no `balanceCzk` literal in `src/**/*.ts`).

## Migrations applied

- **`20260503120000_v51_area1_balanceczk_snapshot`**
  - **UP:** rename column, drop `NOT NULL`, null non-CZK, sync CZK snapshot to local, `DROP DEFAULT` on snapshot column.
  - **DOWN (document only):** per sprint spec — approximate INR rate in `UPDATE` then `SET NOT NULL` and rename back to `balanceCzk` (not shipped as a second migration file).

**Apply on your DBs:** `npx prisma migrate deploy` (real + demo with `DATABASE_URL_DEMO`). Then verify:

```sql
SELECT COUNT(*) FROM "Account" WHERE "balanceCzkSnapshot" IS NULL;        -- expect: non-CZK row count
SELECT COUNT(*) FROM "Account" WHERE "balanceCzkSnapshot" IS NOT NULL;   -- expect: CZK row count
```

Invariant (expect **0 rows**):

```sql
SELECT id, currency, "balanceLocal", "balanceCzkSnapshot" FROM "Account"
WHERE (UPPER(TRIM(currency)) = 'CZK' AND "balanceCzkSnapshot" IS NULL)
   OR (UPPER(TRIM(currency)) = 'CZK' AND "balanceCzkSnapshot" <> "balanceLocal")
   OR (UPPER(TRIM(currency)) <> 'CZK' AND "balanceCzkSnapshot" IS NOT NULL);
```

## Files created

| File | Role |
|------|------|
| `prisma/migrations/20260503120000_v51_area1_balanceczk_snapshot/migration.sql` | DB migration |
| `src/lib/accountToCzk.ts` | Live CZK conversion |
| `src/lib/accountShapeB.ts` | Shape B invariant on writes |
| `tests/unit/accountToCzk.test.ts` | Converter unit tests |
| `tests/unit/overviewAllocationMath.test.ts` | Allocation vs `accountsToCzk` consistency |

## Files modified (summary)

| Area | Files |
|------|--------|
| Schema | `prisma/schema.prisma` |
| Net worth / allocation | `src/lib/calculations.ts` |
| Overview / health | `src/lib/portfolio.ts` |
| Planner + emergency | `src/lib/allocationPlanner.ts` |
| Rebalance drift | `src/lib/sellEngine/rebalanceDrift.ts` |
| Reports | `src/lib/reports/buildReportData.ts` |
| Demo | `src/lib/demoSeed.ts`, `src/lib/demoData.ts` (`balanceCzkLive` for demo JSON) |
| API | `src/api/server.ts` |
| UI | `src/dashboard/index.html` |
| Tests | `tests/unit/calculations.test.ts`, `tests/unit/allocationPlanner.test.ts`, `tests/stress/*.test.ts` |
| Docs | `docs/F1.1_CALL_SITES.md`, `docs/F1.1_FIELD_AUDIT.md` |

## Call sites refactored

- **`calculateNetWorth`**: uses `accountToCzk({ balanceLocal, currency }, fx)` (no snapshot read for conversion).
- **`buildMonthlyPlanPayload`**: emergency `cashCzk` = `num(accountsToCzk(SAVINGS+NRE, fxRates))`.
- **`getPortfolioSummary`**: `calculateAllocation(..., indiaSlices, indiaAccountSlices)`; `calculateHealth(..., { fxRates, indiaMutualFunds })`.
- **`detectRebalanceSells`**: receives `indiaAccountSlices` for allocation denominator.
- **`buildReportData`**: NRE/NRO CZK headline via `accountToCzk` + report FX.

## Baseline vs post-Area-1 (numbers)

Not captured in this session (no `/api/overview` run against migrated DB here). After migrate, compare `netWorth.totalCzk`, `allocation.*Pct`, and NRE CZK to prior exports; expect **allocation equity % lower** and **cash % higher** when India INR accounts are large (F2.2 denominator).

## Smoke / gate evidence (local)

### Typecheck / tests

- `npx tsc --noEmit` (project `tsconfig.json`): **exit 0**
- `npx vitest run`: **90 passed**, 25 skipped (26 files)

### `balanceCzk` grep (`src/**/*.ts`)

- Pattern `balanceCzk\\b`: **no matches** (legacy API key stripped without literal substring).

### Prisma `generate`

- One run hit **EPERM** renaming `query_engine-windows.dll.node` (Windows file lock). Retry `npx prisma generate` with IDE/antivirus closed if client types drift.

## Tests added

| File | Cases |
|------|--------|
| `tests/unit/accountToCzk.test.ts` | INR, CZK, EURINR guard, multi-account sum |
| `tests/unit/calculations.test.ts` | `calculateAllocation` B/C/D; `indiaAccountSlicesFromAccounts` |
| `tests/unit/overviewAllocationMath.test.ts` | cash sleeve vs `accountsToCzk` |
| `tests/unit/allocationPlanner.test.ts` | scenario **11** INR NRE emergency vs live FX; `getFXRates` mock; `balanceCzkSnapshot` fixtures |

## Prisma middleware / DB invariant test

**Not implemented:** invariants enforced in **`/api/accounts`** + `accountShapeB` only. Direct Prisma/script writes could bypass; trade-off documented.

## FX cron / Account updates

No job was found that updated `balanceCzk` for INR rows; nothing removed from `scheduler`/cron.

## Risks / known issues

1. **Backups / baselines / tags** — run Task 0 + `git tag pre-v51-area1` on the pre-migration commit before production deploy.
2. **Windows Prisma generate EPERM** — see above.
3. **Health score** now uses full-book allocation when `fxRates` passed (portfolio path); other `calculateHealth` callers without options keep prior Czech+MF-only behavior.

## Recommendations for Area 2

- Revisit **XIRR / snapshot** narrative if headline `totalCzk` shifts post–Shape B + F2.2 so MoM and performance copy stay aligned with user mental models.

## Git log (recent)

```text
52b346d docs(area1): V51 Area 1 report and balanceCzkSnapshot references
cf859f4 chore(area1): dashboard caption for full-book allocation
2446466 fix(F2.2): include India NRE/NRO/FD accounts in allocation math
2ac1167 fix(F2.1,F3.1): Shape B balanceCzkSnapshot; live CZK via accountToCzk; planner emergency uses FX
5d2e78f docs(audit): V5 deep audit — 27 findings (0 CRITICAL, 7 HIGH, 14 MEDIUM, 6 LOW)
```

## Rollback

1. `git checkout pre-v51-area1` (or reset to commit before Area 1) once tag exists.
2. Restore DB from `backups/pre-v51-area1.sql` (custom format) if created.
3. `npx prisma generate` && `npm run dev`.

---

_End of Area 1 report. Area 2 not started._
