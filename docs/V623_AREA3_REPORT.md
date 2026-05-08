# PIE V6.2.3 — Area 3 — Audit Findings Fix
**Date:** 2026-05-08
**Branch:** `v623-area3` (intended)

## Scope
Closed exactly four findings from `docs/V623_AUDIT.md`:
- H3 — Keyfile missing not surfaced as FAIL in health
- H1 + M4 — Interest tier write + read path lacks validation
- M3 — “Show more” toggle shows duplicated text
- M1 — `evaluate-strategies` and `monitor-profit-caps` missing from `REGISTERED_CRON_JOB_NAMES`

## Changes

### H3 — SECRET_KEYFILE health check (FAIL when missing / wrong size)
- **File:** `src/lib/health.ts`
- **What changed:**
  - Added new health check `SECRET_KEYFILE` right after `CAPITAL_EFFICIENCY`.
  - Uses `existsSync/statSync` to ensure keyfile exists and is exactly 32 bytes.
  - Updated `HEALTH_CHECK_COUNT` from **19 → 20**.
- **Tests:** `tests/unit/health.test.ts` adds/updates coverage for missing/present/wrong-size keyfile behavior.

### H1 + M4 — Interest tier validation on write and read
- **Files:** `src/lib/intelligence/interestTiers.ts`, `src/api/capitalEfficiencyRoutes.ts`
- **What changed:**
  - Added `validateInterestTiers()` + `InterestTierValidationError` type.
  - `parseInterestTiersJson()` now validates and returns `[]` (with a warning) on invalid data.
  - `/api/accounts/:id/interest-tiers` now rejects invalid structures with 400 + details.
- **Tests:** `tests/unit/intelligence/interestTiers.test.ts` extended with validation cases per spec.

### M3 — “Show more” toggle hides preview (no duplicate text)
- **Files:** `src/dashboard/scripts/this-month.js`, `src/dashboard/scripts/portfolio.js`
- **What changed:**
  - Both toggles now wrap preview/full in `[data-reasoning-wrapper]` and ensure **only one** is visible at a time.

### M1 — Cron registry updated
- **File:** `src/lib/cron/cronPlaceholders.ts`
- **What changed:** Added missing jobs:
  - `evaluate-strategies`
  - `monitor-profit-caps`
- **Note:** `src/lib/scheduler.ts` calls `ensureCronJobPlaceholders(...)` on boot, so placeholder rows will appear after restart.

## Gates
- `tsc --noEmit`: **NOT RUN** (package manager not available in this environment)
- `vitest run`: **NOT RUN** (package manager not available in this environment)

## Local commands to finish sprint (required)
From repo root:

```bash
git checkout v623-area1-1-complete
git checkout -b v623-area3
git tag pre-v623-area3

# run gates
npm run -s typecheck
npm test

# commits (per spec)
git add -A
git commit -m "fix(H3): SECRET_KEYFILE health check — FAIL when missing or wrong size"
git commit -m "fix(H1,M4): validate interest tier structure on write and read"
git commit -m "fix(M3): show more toggle hides preview before showing full text"
git commit -m "fix(M1): add evaluate-strategies + monitor-profit-caps to cron registry"
git commit -m "docs(area3): V6.2.3 audit findings fix summary"

git tag v623-area3-complete
git tag v623-complete
git push origin v623-area3 --tags
```

