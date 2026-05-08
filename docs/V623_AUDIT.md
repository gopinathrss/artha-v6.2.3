# PIE V6.2.3 — Pre-Deployment Focused Audit
**Date:** 2026-05-08
**Tag audited:** v623-area1-1-complete
**Auditor:** Cursor (autonomous read-only pass)

## VERDICT

### ✅ READY FOR VPS DEPLOYMENT

---

## CRITICAL FINDINGS (fix before deploy)

None found.

---

## HIGH FINDINGS (fix soon, won't block deploy)

### H1 — `interestTiers` write path accepts structurally invalid tiers
**Severity:** HIGH  
**File:** `src/api/capitalEfficiencyRoutes.ts:19-42`  
**Impact:** A user can save `interestTiers` entries like `{ ratePct: "abc" }`, which later produces `NaN` in capital-efficiency calculations and can make “sleeping money” reporting misleading or unstable.  
**Fix:** Validate each tier object on write: require numeric `ratePct`, require exactly one of `upTo`/`above` and that it is a finite number, reject empty arrays if desired. Consider normalizing to `{ upTo, ratePct }` + `{ above, ratePct }` canonical form.

### H2 — No single-leader / mutex guard for cron jobs (double-fire risk)
**Severity:** HIGH  
**File:** `src/lib/scheduler.ts:20-459`, `src/lib/cronWrapper.ts:7-57`  
**Impact:** If two Node processes run simultaneously (PM2 misconfig, restart overlap, accidental multi-instance), cron jobs can execute twice, producing duplicate snapshots, emails, ledger rows, and strategy evaluations.  
**Fix:** Add a DB-backed distributed lock per job (e.g., advisory lock in Postgres, or a `CronLock` table with TTL + unique key). Alternatively ensure VPS deploy runs as a single instance and document this as a hard constraint.

### H3 — Secret keyfile presence is not a health FAIL (risk of “new key generated”)
**Severity:** HIGH  
**File:** `src/lib/secrets.ts:25-57`, `src/lib/health.ts:49-473`  
**Impact:** If the keyfile is missing on the VPS, `loadOrCreateKey()` will generate a new key (`secrets.ts:47-56`). Existing encrypted secrets in DB will then fail decryption (“key mismatch”), causing integrations/auth flows to break until secrets are re-entered. There is no explicit health check to catch “keyfile missing” early.  
**Fix:** Add a dedicated health check that verifies the keyfile exists and is 32 bytes, and mark FAIL when missing in production environments.

### H4 — `convertCurrency()` hard-fails when FX is stale beyond 168h
**Severity:** HIGH  
**File:** `src/lib/currency.ts:194-208`  
**Impact:** Some flows that call `convertCurrency()` will throw when FX is older than 168h (`FX_STALENESS_FAIL_HOURS`), potentially breaking user-facing pages or jobs during outages. Other flows (e.g. plan generation) use `getFXRates()` which explicitly falls back (`src/lib/fetchers.ts:37-55`), so behavior is inconsistent across the app.  
**Fix:** Decide whether stale FX should be “degrade with warnings” globally or “hard stop” globally. If hard stop is intended, ensure callers handle the thrown error and surface a clear message; if not, change `convertCurrency()` to warn+proceed with cached/fallback.

---

## MEDIUM FINDINGS

### M1 — Cron placeholder registry missing new cron jobs; placeholder status string inconsistent with comment
**Severity:** MEDIUM  
**File:** `src/lib/cron/cronPlaceholders.ts:4-23`, `src/lib/scheduler.ts:67-87`  
**Impact:** `scheduler.ts` registers `evaluate-strategies` and `monitor-profit-caps` (`scheduler.ts:67-87`), but `REGISTERED_CRON_JOB_NAMES` does not include them (`cronPlaceholders.ts:4-23`). This weakens ops observability (“registered but never run” cannot be distinguished from “not registered”). Also placeholders insert `status: 'SCHEDULED'` (`cronPlaceholders.ts:34-45`) while the schema comment documents only RUNNING/SUCCESS/FAILED (`prisma/schema.prisma:649-662`).  
**Fix:** Keep `REGISTERED_CRON_JOB_NAMES` in sync with `scheduler.ts`. Consider formalizing CronExecution.status values (enum or documented allowed set including SCHEDULED).

### M2 — Plan row mutation paths validate allocations, but still operate on raw JSON array
**Severity:** MEDIUM  
**File:** `src/lib/planRowUpdate.ts:21-32`, `src/lib/followThrough.ts:20-27`, `src/lib/planAllocationsRead.ts:38-49`  
**Impact:** Mutations call `readPlanAllocationsForMutation(plan)` (good), but then still read `plan.allocations as unknown` and proceed if it’s an array. This is mostly safe, but increases the chance of subtle mismatch if `plan.allocations` is an array but contains corrupted row shapes (e.g., missing fields) — validation happens via `parsePlanAllocations(next)` only at the end (`planRowUpdate.ts:91-92`, `followThrough.ts:98-99`).  
**Fix:** Use the parsed/validated rows as the source of truth for mutations, and only re-serialize after applying the mutation.

### M3 — This-month “Show more” toggle shows full text without hiding the preview
**Severity:** MEDIUM  
**File:** `src/dashboard/scripts/this-month.js:286-316`  
**Impact:** Clicking “Show more” reveals the full reasoning while the truncated preview remains visible, causing duplicated text and a cluttered UI.  
**Fix:** When expanding, hide the preview span (or swap innerHTML to one mode at a time). (UI-only.)

### M4 — `parseInterestTiersJson` is a permissive cast (no structural validation)
**Severity:** MEDIUM  
**File:** `src/lib/intelligence/interestTiers.ts:7-19`  
**Impact:** Read-time parsing returns `raw as InterestTier[]` for any array, even when entries are not objects or have non-numeric `ratePct`. This amplifies the write-path risk.  
**Fix:** Add structural validation (or a safe-normalize step) on read and/or write.

---

## CONFIRMED FIXED (from V6.1 audit)

Quick verification list — one line per item with evidence.

| Finding | Status | Evidence |
|---------|--------|----------|
| Shape B: non-CZK accounts must have null `balanceCzkSnapshot` | CLOSED | `prisma/schema.prisma:66-68` nullable; enforced by `balanceCzkSnapshotForWrite()` in `src/lib/accountShapeB.ts:29-39` |
| XIRR Shape A headline fix | CLOSED | `calculateXIRR()` returns `displayValue` + `displayState` in `src/lib/calculations.ts:15-66` |
| Dashboard auth uses bcrypt + rate limiting | CLOSED | `bcrypt.compare` in `src/api/dashboardAuthRoutes.ts:124-125`; `rateLogin` limit 12/5m in `src/api/dashboardAuthRoutes.ts:26-35` |
| Session cookie HttpOnly + SameSite=Lax | CLOSED | `buildSetCookieHeader` uses `HttpOnly; SameSite=Lax` in `src/lib/dashboardAuth.ts:84-90` |
| Memory health threshold bands updated | CLOSED | `heap … (warn ≥80%, fail ≥97%)` in `src/lib/health.ts:429-439` |
| Min sell threshold suppresses small REBALANCE_DRIFT sells | CLOSED | threshold param + skip in `src/lib/sellEngine/rebalanceDrift.ts:123-161` and passed from merged settings in `src/lib/allocationPlanner.ts:247-257` |
| Strategy guard prevents AT_TARGET HOLD from suppressing approved strategy BUY | CLOSED | STRATEGY GUARD block in `src/lib/allocationPlanner.ts:480-513` |
| Secret keyfile excluded from git | CLOSED | `.gitignore:13-16` (`secret.key`, `*.secret.key`) |
| Drawdown “no historical max” treated as hard stop | CLOSED | `riskSell = true` when `historicalMaxPct == null` in `src/lib/intelligence/signals/drawdownSignal.ts:81-89` |

---

## NEW RISKS IDENTIFIED

- **Cron single-leader gap remains** (double-fire risk): `src/lib/scheduler.ts` + `src/lib/cronWrapper.ts` (see H2).
- **Secret keyfile missing is not surfaced as a FAIL** in `/api/health` (see H3).
- **Tiered interest write path lacks structural validation** (see H1).

---

## SUSPECTED (cannot confirm without running server)

| ID | Item | How to verify |
|----|------|---------------|
| S1 | Tag fidelity: workspace state matches `v623-area1-1-complete` | Checkout tag locally and re-check the referenced files/lines. |
| S2 | INR accounts truly have `balanceCzkSnapshot = null` in live DB | Run a DB query on VPS: `SELECT id,currency,balanceCzkSnapshot FROM "Account" WHERE currency='INR';` Expect all snapshot values NULL. |
| S3 | Cron double-fire likelihood under the intended VPS process manager | Confirm PM2 config runs **single instance** (no cluster mode) and no overlapping deploy restarts. |

---

## DEPLOYMENT CHECKLIST

Before going live on VPS, verify:
- [ ] Secret keyfile copied to VPS (`~/.artha/secret.key` or `PIE_SECRET_KEY_PATH`) — must be 32 bytes (`src/lib/secrets.ts:36-46`)
- [ ] All integration API keys re-entered in Settings (encrypted to the VPS keyfile)
- [ ] `prisma migrate deploy` run on VPS DB
- [ ] POST `/api/strategies/propose-all` run after first boot
- [ ] `/api/health` returns trust score > 70
- [ ] Daily snapshot cron fires on day 1 (`src/lib/scheduler.ts:50-65`)

