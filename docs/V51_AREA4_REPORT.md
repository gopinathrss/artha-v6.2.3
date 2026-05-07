# V5.1 Hardening — Area 4 — Security, Retention, Observability + Re-audit

## Status: COMPLETE (code gates)

Last Cursor pass: `.\node_modules\.bin\tsc.cmd --noEmit` → **0**; `.\node_modules\.bin\vitest.cmd run` → **127 passed** (31 skipped). Run P0–P5, `prisma migrate deploy`, and `ARTHA_TEST_DB_LIVE=1` vitest on your workstation before `git tag v5.1-hardened`. If `prisma generate` hits EPERM on Windows, retry after closing processes locking `query_engine-windows.dll.node`.

## Pre-flight (fill on workstation)

| Check | Result |
|-------|--------|
| P0.1 `v51-area3-complete` | |
| P0.2 `AllocationPlanRow` + retention columns | |
| P0.3 tsc + vitest | |
| P0.4 `/api/health` 200 | |
| P0.5 dual-write json_count == row_count | |

## Findings closed (intended)

| ID | Summary |
|----|---------|
| Area 3 stretch | `readPlanAllocationsOrEmpty` / `readPlanAllocationsForMutation` wired across readers + mutations |
| F10.1 | AES-256-GCM, keyfile, `getSecret`/`setSecret`, Settings POST, migrate script |
| F11.1 | `pruneOldRows` + weekly `prune-old-rows` + Settings retention ints |
| F11.2 | Dedup doc + dismissed `AlertLog` prune + alerts API/UI notes |
| F6.1 | `bootstrapSystemHealth` on server boot |
| F6.2 | `ensureCronJobPlaceholders` after scheduler registration |
| F8.1 | NAV WARN for Erste-only empty `NavHistory` |
| F4.1 | Outcomes `pendingBlurb` / `pendingCount` + reports UI |
| F8.2 | `HEALTH_CHECK_COUNT` = **17** (`RETENTION_POLICY`) |
| F9.1 / F9.2 | `tests/smoke/faultInjection.md` checklist |
| F12.2 | `tests/unit/backtest/determinism.test.ts` (live DB) |

## Migrations

- `20260505120000_v51_area4_retention_settings__ttl_columns` — retention columns on `Settings`.

## Files created

- `src/lib/secrets.ts`, `src/lib/planAllocationsRead.ts`, `src/lib/bootstrapSystemHealth.ts`
- `src/lib/cron/pruneOldRows.ts`, `src/lib/cron/cronPlaceholders.ts`
- `scripts/migrate-plaintext-secrets.ts`
- `tests/unit/secrets.test.ts`, `tests/unit/pruneOldRows.test.ts`, `tests/unit/planReaders.test.ts`, `tests/unit/cron/cronPlaceholders.test.ts`, `tests/unit/backtest/determinism.test.ts`, `tests/smoke/faultInjection.md`
- `docs/V5_DEEP_AUDIT_POST_HARDENING.md`

## Rollback

`git reset --hard pre-v51-area4` + restore `pg_dump` backups from Area 4 Task 0.

## Git

Use one commit per finding on your branch (`fix(F10.1): …`, etc.) per sprint rules; this Cursor pass may be squashed on your side.
