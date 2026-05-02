# ARTHA V5 Deep Audit

**Date:** 2026-05-02  
**Auditor:** Cursor (autonomous)  
**Source tag:** v5.0 (commit 79a0736)  
**Method:** Read-only code walk + `psql` / `curl` / `rg` against local `artha_v4` on `127.0.0.1:5544` and running API on `127.0.0.1:3002` where available. No application code changes.

## Executive summary

**Total findings:** 27  

- **CRITICAL:** 0  
- **HIGH:** 7  
- **MEDIUM:** 14  
- **LOW:** 6  

V5 successfully migrated core money columns to **`Decimal`** (no `double precision` columns in `public`). **Update (V5.1 Area 1, 2026-05-02):** India **allocation %** and **emergency-cash math** now include the India account book where specified; NRE stale `balanceCzk` is removed in favor of **`balanceCzkSnapshot` + `accountToCzk`** (see `docs/V51_AREA1_REPORT.md`). Remaining executive-summary risks include **`XIRR` estimate path**, unversioned plan **`Json`**, and **plan vs `BacktestLesson` text** drift. Browser UX, full failure-injection, and third-party availability tests are largely **SUSPECTED / unexecuted** here.

### V5.1 Area 1 — HIGH findings closed in code

| ID | Title | Resolution (summary) |
|----|--------|-------------------------|
| F2.1 | Stale NRE `balanceCzk` | Shape B: `balanceCzkSnapshot` null for non-CZK; live CZK via `accountToCzk` |
| F3.1 | Planner emergency used `balanceCzk` | `accountsToCzk` on SAVINGS+NRE with live FX |
| F2.2 | Allocation ignored India accounts | `indiaAccountSlicesFromAccounts` + `calculateAllocation` optional slice |

## Findings by severity

### CRITICAL

_(none confirmed in this pass)_

### HIGH

- **F1.1** — `AllocationPlan.allocations` remains schema-unenforced `Json`  
- **F2.1** — NRE `Account.balanceCzk` can diverge from live INR→CZK conversion used in net worth  
- **F2.2** — `calculateAllocation` equity/bond/cash % ignores NRE/NRO/FD account balances (India book)  
- **F2.3** — `XIRR` headline value can be wildly misleading (`annualized estimate` path)  
- **F3.1** — `buildMonthlyPlanPayload` emergency / cash bucket uses `balanceCzk` for NRE (stale) instead of `accountToCzk`  
- **F3.2** — Current month plan BUY reasons lack appended lesson narrative while `HistoricalNavStats` exist (stale plan / test plans / ordering)  
- **F10.1** — When populated, API keys / IMAP password are stored **plaintext** in `Settings` (schema `String` fields)

### MEDIUM

- **F2.4** — MoM uses a ±3 day snapshot window; easy to show “unavailable” despite snapshots existing  
- **F2.5** — `gainPct` is `(totalCzk − totalInvested) / totalInvested` where `totalInvested` is SIP outflows only — not intuitive “portfolio return”  
- **F3.3** — Within 90 days of tax-free, planner may still emit reduced **BUY** to existing equity (not “HOLD-only silence”)  
- **F4.1** — All `RecommendationOutcome` rows `PENDING` (no 30d/90d completions yet in this DB)  
- **F4.2** — `ARTHA_DEBUG_AI_CONTEXT` outcome-history logging not exercised in this pass  
- **F6.1** — `SystemHealth` table empty until subsystems write rows (AI/AMFI paths); observability gap for fresh installs  
- **F6.2** — `CronExecution` sample shows only a subset of registered jobs have run in this DB window  
- **F8.1** — `/api/health` reports `NAV_FRESHNESS: FAIL` when `NavHistory` empty (expected here, but noisy for new users)  
- **F9.1** — Malformed JSON / concurrent `generate-now` behaviour not exercised in this pass (**SUSPECTED** — see end)  
- **F9.2** — Historical import per-ISIN failure aggregation under outage not re-simulated (**SUSPECTED** details)  
- **F10.2** — Demo / onboarding rapid-toggle stress not re-run (**SUSPECTED**)  
- **F11.1** — No TTL pruning observed for `CronExecution` / `SystemHealth` / `EmailIngestionPreview` growth  
- **F11.2** — Alert “30 day” behaviour is **dedup window**, not guaranteed physical row purge  
- **F12.2** — Backtest determinism + Yahoo spot-check not re-run (**SUSPECTED** without fresh double-run)

### LOW

- **F1.2** — `chart.js` uses `.toFixed` on chart pixel coordinates only (non-money)  
- **F5.1** — Visual / a11y / loading / error-state quality across 14 routes not re-audited in browser this run  
- **F7.1** — Smart report HTML section completeness vs Sprint 5 spec not re-validated byte-for-byte in this pass  
- **F8.2** — Health check count is 16 while some docs/smoke text still say “14+”  
- **F12.1** — Pattern YAML cites external studies; factual accuracy not independently verified  
- **F12.3** — Ad-hoc `AllocationPlan` rows for far-future `monthYear` (e.g. `2030-07`) clutter DB and confuse lesson linkage audits

## Findings by track

### Track 1 — Data integrity

### F1.1 — Allocation JSON still has no DB-level schema

**Severity:** HIGH  
**Track:** 1  
**Status:** OPEN  
**Sprint origin:** V4 (carried); still true in V5.0  

**Evidence:**

```364:366:prisma/schema.prisma
  allocations            Json
  continuity             Json?
  userOverride           Json?
```

**Reproduction:**

1. `rg "allocations\\s+Json" prisma/schema.prisma`  
2. Compare with typed `AllocationRow` usage in `src/lib/allocationPlanner.ts` (only TS enforces shape).

**Impact:** Manual DB edits, partial deploys, or bug regressions can corrupt plans; dashboards fail at runtime without migration-time detection.

**Recommended fix:** Add JSON schema validation on write (AJV/Zod) and/or migrate hot fields to relational tables in V5.1; version the JSON with a `schemaVersion` field inside the blob.

---

### F1.2 — Chart JS uses `.toFixed` on non-money geometry

**Severity:** LOW  
**Track:** 1  
**Status:** OPEN  
**Sprint origin:** unknown  

**Evidence:** `src/dashboard/scripts/chart.js` line 25 maps SVG path with `xScale(i).toFixed(1)` — not monetary.

**Reproduction:** `rg "\\.toFixed" src/dashboard/scripts/chart.js`

**Impact:** None for money; listed only to avoid false positives during Decimal audits.

**Recommended fix:** None required; keep separated from money formatters in reviews.

---

### Track 2 — Real data behaviour

### F2.1 — NRE `balanceCzk` snapshot diverges from live FX book

**Severity:** HIGH  
**Track:** 2  
**Status:** OPEN  
**Sprint origin:** V5-S1 / data model  

**Evidence:**

`psql` (2026-05-02):

```text
 id                        | name              | type  | balanceCzk | balanceLocal | currency
---------------------------+-------------------+-------+------------+--------------+----------
 cmomkxfbp0005q1rc4krlwjwo | NRE (demo)        | NRE   |  442149.00 |   2000000.00 | INR
```

`curl http://127.0.0.1:3002/api/overview` excerpt:

```json
"indiaNRECzk":438644,"totalCzk":860833.19
```

Delta `442149 − 438644 = 3505` CZK (material vs single-user CFO expectations).

**Reproduction:**

1. `psql -U postgres -p 5544 -d artha_v4 -c 'SELECT "balanceCzk","balanceLocal",currency FROM "Account" WHERE type = ''NRE'';'`  
2. `curl.exe -s http://127.0.0.1:3002/api/overview` and compare `data.netWorth.indiaNRECzk`.

**Impact:** Any UI or SQL that trusts `Account.balanceCzk` for INR accounts will disagree with `/api/overview` (which recomputes from `balanceLocal` and FX).

**Recommended fix:** On FX update job, recompute and persist `balanceCzk` for non-CZK accounts from `balanceLocal`, or stop persisting `balanceCzk` for INR and always derive at read time.

---

### F2.2 — Allocation % ignores India NRE/NRO/FD accounts

**Severity:** HIGH  
**Track:** 2  
**Status:** OPEN  
**Sprint origin:** V5-S1 / V5-S3  

**Evidence:** `calculateAllocation` adds MF slices only; account loops live in `calculateNetWorth`, not here:

```433:458:src/lib/calculations.ts
export function calculateAllocation(
  holdings: any[],
  targetEquity: number,
  targetBonds: number,
  targetCash: number,
  indiaFundSlices?: { equityCzk: number; bondsCzk: number; cashCzk: number } | null
): AllocationResult {
  ...
  for (const h of holdings || []) {
    if (h?.status === 'EXITED') continue
    const v = d(h?.currentValueCzk)
    ...
  }
  if (indiaFundSlices) {
    equityCzk = equityCzk.plus(d(indiaFundSlices.equityCzk))
```

Live API (`curl /api/overview`) with ~438k CZK India NRE still shows:

```json
"allocation":{"equityPct":48.60,"equityCzk":20505.62,...}
```

`20505` matches **Czech funds only**, not full book.

**Reproduction:** `curl.exe -s http://127.0.0.1:3002/api/overview | findstr equityCzk` while NRE balance is large.

**Impact:** User-facing “equity % vs 60% target” is computed on ~42k CZK sleeve, not full net worth — drives wrong rebalance urgency.

**Recommended fix:** Extend `calculateAllocation` (or a successor) to accept India **account** buckets (NRE/NRO/FD) converted with the same `accountToCzk` path, or compute allocation percentages off `netWorth` components directly.

---

### F2.3 — XIRR can return extreme misleading headline numbers

**Severity:** HIGH  
**Track:** 2  
**Status:** OPEN  
**Sprint origin:** V4 / V5-S1  

**Evidence:** `curl /api/overview` excerpt:

```json
"xirr":{"value":-83.84014391157386,"isEstimate":true,"note":"annualized estimate","cashflowCount":7}
```

`calculateXIRR` documents short-horizon estimate behaviour in `src/lib/calculations.ts` (lines ~126–182).

**Reproduction:** `curl.exe -s http://127.0.0.1:3002/api/overview` on the seeded portfolio.

**Impact:** A single negative headline “IRR” can look like catastrophic performance despite benign holdings; undermines trust in the Overview card.

**Recommended fix:** Hide or downgrade `value` when `isEstimate` is true; show range / label “short-horizon proxy” and link to methodology doc.

---

### F2.4 — MoM label “unavailable” despite recent `Snapshot`

**Severity:** MEDIUM  
**Track:** 2  
**Status:** OPEN  
**Sprint origin:** V4 / V5-S1  

**Evidence:** Same `/api/overview` payload shows:

```json
"snapshots":[{"netWorthCzk":"42189.19","date":"2026-05-01T00:00:00.000Z",...}],
"momChange":{"czk":null,"pct":null,"label":"MoM unavailable (no snapshot ~30 days old)"}
```

**Reproduction:** Compare `data.snapshots[0].date` with `data.momChange.label` after import.

**Impact:** Users think history pipeline is broken when MoM is blank while snapshots exist.

**Recommended fix:** Broaden `monthAgoSnapshot` window in `src/lib/portfolio.ts` or fall back to latest snapshot older than 20 days.

---

### F2.5 — `gainPct` is not intuitive “portfolio return”

**Severity:** MEDIUM  
**Track:** 2  
**Status:** OPEN  
**Sprint origin:** V4  

**Evidence:** `/api/overview` shows `gainPct` ~720 with `totalInvested` 104,950 vs `totalCzk` 860,833 — consistent with `gainCzk / totalInvested * 100` in `calculateNetWorth` but not a time-weighted return.

**Reproduction:** Inspect `data.totalInvested`, `data.netWorth.gainPct`, holdings.

**Impact:** Users may interpret `gainPct` like fund fact-sheet CAGR; mismatch with `xirr`.

**Recommended fix:** Rename UI field to “inflow-weighted gain %” or add true money-weighted return once XIRR stable.

---

### Track 3 — SELL/HOLD/BUY engine

### F3.1 — Planner uses `balanceCzk` for NRE in emergency cash math

**Severity:** HIGH  
**Track:** 3  
**Status:** OPEN  
**Sprint origin:** V5-S1  

**Evidence:**

```182:187:src/lib/allocationPlanner.ts
  const cashCzk = accounts
    .filter((a) => a.type === 'SAVINGS' || a.type === 'NRE')
    .reduce((s, a) => s + num(a.balanceCzk), 0)
  const targetEmerg = num(profile.emergencyFundTarget) || fixed * 6
  const gap = Math.max(0, targetEmerg - cashCzk)
```

**Reproduction:** Compare `cashCzk` intermediate (log locally) vs recomputation using `accountToCzk` from `balanceLocal`.

**Impact:** Emergency top-up sizing can be wrong when INR `balanceCzk` stale vs FX (pairs with **F2.1**).

**Recommended fix:** Reuse `accountToCzk` / `calculateNetWorth` helper for SAVINGS+NRE liquidity instead of summing `balanceCzk`.

---

### F3.2 — BUY reasons on active plan lack appended lesson text

**Severity:** HIGH  
**Track:** 3  
**Status:** OPEN  
**Sprint origin:** V5-S5  

**Evidence:**

`curl /api/this-month` BUY sample:

```text
IE00B3XXRP09 Vanguard S&P 500 UCITS ETF Equity toward 60% target; top library match in George.
```

No `5-year CAGR` fragment while `psql` shows:

```text
 IE00B3XXRP09 | 827
 IE00B3F81409 | 844
```

`BacktestLesson` rows exist with narratives for those ISINs but `linkedPlanId` points to a **different** plan (`monthYear = 2030-07`, `generatedAt = 2026-05-02`).

**Reproduction:**

1. `curl.exe -s http://127.0.0.1:3002/api/this-month`  
2. `psql` query `HistoricalNavStats` + `BacktestLesson` as above.

**Impact:** `/this-month` UX omits Sprint-5 “fund lesson” copy users expect; also makes audits think extractor is broken.

**Recommended fix:** Regenerate May plan after confirming lesson merge path; add integration test asserting BUY `reason` contains narrative when stats exist; optionally forbid far-future `monthYear` plans from UI.

---

### F3.3 — Tax-window funds may still receive BUY guidance

**Severity:** MEDIUM  
**Track:** 3  
**Status:** OPEN  
**Sprint origin:** V5-S4  

**Evidence:** `allocationPlanner.ts` lines ~288–314: when `nearTax`, code still calls `addBuy` with reduced amount to **existing** equity.

**Reproduction:** Static read of `src/lib/allocationPlanner.ts` near `nearTax` branch.

**Impact:** Policy nuance: some advisors want **no** new buys inside 90-day window; current behaviour is “smaller buy into same ISIN”.

**Recommended fix:** Document clearly in UI; optionally gate buys to zero when `nearTax` unless user overrides.

---

### Track 4 — Recommendation continuity + outcomes

### F4.1 — Outcome rows all still `PENDING`

**Severity:** MEDIUM  
**Track:** 4  
**Status:** OPEN  
**Sprint origin:** V5-S4  

**Evidence:**

```text
 outcome_by_status | PENDING | 10
```

**Reproduction:** `psql -c "SELECT status, COUNT(*) FROM \"RecommendationOutcome\" GROUP BY 1;"`

**Impact:** `/reports` outcome widgets stay “pending” until horizons elapse — expected, but users may think cron is dead.

**Recommended fix:** Surface “first evaluation on DATE” copy; optional seed/demo completed outcomes for demos.

---

### F4.2 — `ARTHA_DEBUG_AI_CONTEXT` not exercised

**Severity:** MEDIUM (downgraded to **SUSPECTED** execution — treat as MEDIUM observability)  
**Track:** 4  
**Status:** OPEN  
**Sprint origin:** V5-S3  

**Evidence:** `rg ARTHA_DEBUG_AI_CONTEXT src/lib/aiIntelligence.ts` shows gating at line ~202; no log captured in this audit (no AI call with env flag).

**Reproduction:** Run Ask Artha with `ARTHA_DEBUG_AI_CONTEXT=1` and inspect server stdout (not done here).

**Impact:** Cannot confirm outcome history injection without manual run.

**Recommended fix:** Add automated test or scripted smoke that sets the env flag and asserts substring `RECENT EXECUTION HISTORY` in logs.

---

### Track 5 — UI/UX

### F5.1 — Browser-level visual / a11y / loading pass not repeated

**Severity:** LOW / **SUSPECTED** details  
**Track:** 5  
**Status:** OPEN  
**Sprint origin:** V5-S2  

**Evidence:** Playwright `all-pages.spec.ts` passed in Sprint 6 (56/56) but this audit did not re-run in this session.

**Reproduction:** `PW_REUSE_SERVER=1 npx playwright test tests/visual/all-pages.spec.ts`

**Impact:** Visual regressions outside screenshot baselines could slip.

**Recommended fix:** Keep Playwright in CI; optionally add axe-core smoke in V5.1.

---

### Track 6 — System flow + lifecycle

### F6.1 — `SystemHealth` empty on this DB

**Severity:** MEDIUM  
**Track:** 6  
**Status:** OPEN  
**Sprint origin:** V5-S2  

**Evidence:**

```text
 systemhealth_count | 0
```

**Reproduction:** `psql -c "SELECT COUNT(*) FROM \"SystemHealth\";"`

**Impact:** `AI_RECENT_FAILURES` and similar checks may lack historical signal until AI/ingest paths write rows.

**Recommended fix:** Seed a HEALTH bootstrap row on migrate or document “empty until first AI call”.

---

### F6.2 — Cron ledger sparse vs registered jobs

**Severity:** MEDIUM  
**Track:** 6  
**Status:** OPEN  
**Sprint origin:** V5-S5  

**Evidence:**

```text
 jobName            | status  | n
--------------------+---------+---
 amfi-navall-ingest | SUCCESS | 2
 daily-digest       | SUCCESS | 1
 email-ingestion    | SUCCESS | 10
```

Many scheduler jobs (`src/lib/scheduler.ts`) have no rows yet — expected before their first fire, but hard to distinguish “not scheduled” vs “scheduled but silent”.

**Reproduction:** `psql` query on `CronExecution` grouped by `jobName`.

**Impact:** Ops cannot see upcoming-first-run jobs at a glance.

**Recommended fix:** Insert `SCHEDULED` placeholder rows or document expected first-run timestamps in `/settings` diagnostics.

---

### Track 7 — Reporting

### F7.1 — Smart report reconciliation vs dashboard not re-run

**Severity:** LOW (verification gap)  
**Track:** 7  
**Status:** OPEN  
**Sprint origin:** V5-S5  

**Evidence:** No `POST /api/reports/generate` capture in this audit session (timeboxed).

**Reproduction:** `curl.exe -X POST http://127.0.0.1:3002/api/reports/generate -H "Content-Type: application/json" -d "{\"type\":\"MONTHLY\"}"` then diff numbers to `/api/overview`.

**Impact:** Unknown drift risk between HTML report tables and live summary.

**Recommended fix:** Add scripted diff test in V5.1 CI.

---

### Track 8 — Alerts + observability

### F8.1 — `NAV_FRESHNESS` fails when `NavHistory` empty

**Severity:** MEDIUM  
**Track:** 8  
**Status:** OPEN  
**Sprint origin:** V5-S2  

**Evidence:** `curl /api/health` (2026-05-02) first checks:

```json
{"name":"NAV_FRESHNESS","status":"FAIL","message":"No NavHistory yet"}
```

while `psql` shows `NavHistory` count `0`.

**Reproduction:** `curl.exe -s http://127.0.0.1:3002/api/health`

**Impact:** Trust score penalised for Erste-only portfolios until NavHistory populated; may alarm users.

**Recommended fix:** Treat Erste `Holding.nav` freshness separately or downgrade severity when all CZ funds use `navSourceType=ERSTE` without `NavHistory`.

---

### F8.2 — Health check count is 16 (not “14+” wording drift)

**Severity:** LOW  
**Track:** 8  
**Status:** OPEN  
**Sprint origin:** V5-S2  

**Evidence:** `curl /api/health` → `checks` array length `16` (`HEALTH_CHECK_COUNT` constant in `src/lib/health.ts`).

**Reproduction:** `curl.exe -s http://127.0.0.1:3002/api/health | findstr "\"name\""`

**Impact:** Docs/smoke scripts that hard-code “14 checks” drift.

**Recommended fix:** Central export consumed by docs + smoke.

---

### Track 9 — Stability + failure modes

### F9.1 — External API / DB failure simulations not executed

**Severity:** MEDIUM (process gap)  
**Track:** 9  
**Status:** OPEN (mark **SUSPECTED** per framework)  
**Sprint origin:** unknown  

**Evidence:** No `/etc/hosts` blocks, no Postgres stop, no bad API key runs in this session.

**Reproduction:** Follow framework checklist (Yahoo block, Erste block, bad `ANTHROPIC_API_KEY`, stop Postgres mid-request).

**Impact:** Resilience claims remain unproven for V5.1 hardening.

**Recommended fix:** Add fault-injection smoke scripts + document observed status codes/body shapes.

---

### F9.2 — Historical import isolates per-ISIN failures

**Severity:** MEDIUM (positive partial, residual risk)  
**Track:** 9  
**Status:** OPEN  
**Sprint origin:** V5-S5  

**Evidence:** `importAllHistoricalNavs` aggregates errors per ISIN (`src/lib/historical/import.ts`); Yahoo outage yields partial `processed` count (observed in Sprint 6 logs in prior session).

**Reproduction:** Run `scripts/import-historical-navs.ts` with network blocked (not executed here — **SUSPECTED** exact behaviour).

**Impact:** Cron may look “green” while subset of library ISINs lack stats.

**Recommended fix:** Surface error list length in `CronExecution.metadata` and advisor journal on threshold.

---

### Track 10 — Settings + lifecycle

### F10.1 — Secrets stored as plaintext `String` columns

**Severity:** HIGH  
**Track:** 10  
**Status:** OPEN  
**Sprint origin:** V4 / V5-S1  

**Evidence:** `prisma/schema.prisma` `Settings` model includes `smtpPass`, `imapPassword`, `openaiApiKey`, `telegramBotToken` as plain `String?`. Current DB shows `imapPassword` / `openaiApiKey` null (no live secret rows to dump here), but the schema still permits storing raw secrets.

**Reproduction:** `psql` + schema read as above.

**Impact:** DB backup leakage equals credential leakage.

**Recommended fix:** Encrypt at rest with OS/user-scoped key, or integrate Windows credential manager / vault.

---

### F10.2 — Demo / onboarding stress not re-run

**Severity:** MEDIUM (**SUSPECTED**)  
**Track:** 10  
**Status:** OPEN  
**Sprint origin:** V5-S4  

**Evidence:** Sprint 4 claimed demo isolation verified; this audit did not repeat rapid toggle test.

**Reproduction:** Toggle `demoModeEnabled` in UI five times while marker row exists in real DB (per framework).

**Impact:** Regression risk if `invalidateDemoStateCache` paths change.

**Recommended fix:** Add automated integration test hitting `realPrisma` vs `getPrisma()` markers.

---

### Track 11 — Data lifecycle + retention

### F11.1 — High-volume tables lack documented retention policy

**Severity:** MEDIUM  
**Track:** 11  
**Status:** OPEN  
**Sprint origin:** V5-S1 / V5-S5  

**Evidence:** Schema includes `CronExecution`, `SystemHealth`, `EmailIngestionPreview`, `HistoricalNavSummary` (~25k rows in prod) with indexes but no TTL fields.

**Reproduction:** `psql` counts + schema review.

**Impact:** Years-long single-user installs may grow disk without operator awareness.

**Recommended fix:** Add cron “vacuum old rows” with configurable retention; export+clear `EmailIngestionPreview` after approve.

---

### F11.2 — Alert dedup uses 30-day dismissed window (not physical delete)

**Severity:** MEDIUM  
**Track:** 11  
**Status:** OPEN  
**Sprint origin:** V4 / V5 hardened  

**Evidence:**

```1:4:src/lib/alerts/dedup.ts
const DISMISS_RETENTION_MS = 30 * 86400000
```

**Reproduction:** Read `fireAlertWithDedup`.

**Impact:** Operators expecting “auto-delete dismissed alerts after 30 days” may misread code — rows remain until manual prune.

**Recommended fix:** Document in `/alerts` UI + optional purge job.

---

### Track 12 — V5-specific (patterns / backtest / reports)

### F12.1 — Pattern YAML factual accuracy not independently verified

**Severity:** LOW  
**Track:** 12  
**Status:** OPEN  
**Sprint origin:** V5-S5 / V5-S6  

**Evidence:** `data/patterns/v1.yaml` lines 3–14 show plausible citations (`Fidelity 2023 study`, `Brinson et al.`) — not re-validated against primary sources in this audit.

**Reproduction:** `read data/patterns/v1.yaml` first 20 lines.

**Impact:** If a citation is wrong, AI persuasive power becomes liability.

**Recommended fix:** Add maintainer checklist + link-out URLs stored in YAML.

---

### F12.2 — Backtest determinism + Yahoo spot-check not re-run

**Severity:** MEDIUM (**SUSPECTED** without fresh double-run)  
**Track:** 12  
**Status:** OPEN  
**Sprint origin:** V5-S4  

**Evidence:** Engine caches by fingerprint in `POST /api/backtest/run` (`cfoRoutes.ts`); deterministic maths assumed but not re-proved here.

**Reproduction:** POST identical payload twice, compare `cagrPct` / `resultJson`.

**Recommended fix:** Add Vitest golden vector against known `HistoricalNavSummary` slice.

---

### F12.3 — “Far future” `AllocationPlan` rows from manual/testing

**Severity:** LOW  
**Track:** 12  
**Status:** OPEN  
**Sprint origin:** unknown  

**Evidence:** `psql` shows plan `cmonu3dap0000q1r065xfgn84` with `monthYear = 2030-07` linked from `BacktestLesson`.

**Reproduction:** `SELECT id, "monthYear" FROM "AllocationPlan" ORDER BY "generatedAt" DESC LIMIT 5;`

**Impact:** Clutters analytics and confuses audits (pairs with **F3.2**).

**Recommended fix:** Restrict `monthYear` server-side to ±10y of current date; add cleanup script.

---

## Suspected (could not confirm)

| Item | What to run |
|------|----------------|
| Yahoo / Erste hard-down behaviour during cron | Block hosts / use bad proxy; watch `CronExecution.errors` |
| `POST /api/this-month/generate-now` with invalid JSON | Send `Content-Type: application/json` body `garbage` |
| Concurrent double POST `generate-now` | `ab` / parallel `curl` |
| Rapid demo toggle corruption | Marker row technique from framework |

---

## What was verified working

- **`public` schema has zero `double precision` money columns** (`information_schema` query returned `0 rows`).  
- **`HistoricalNavSummary.nav` / stats / outcomes / email preview** use `@db.Decimal` types in `schema.prisma`.  
- **Dashboard money formatters** reviewed (`overview.js`, `library.js`, `backtest.js`, `portfolio.js`, `this-month.js`, `patterns.js`) — `Number()` precedes `.toFixed` on monetary paths audited.  
- **Tax-window sell protection for drift sells** — `inTaxDeferWindow` skips candidates in `rebalanceDrift.ts` lines 12–21, 68–69.  
- **`INACTIVE` holdings** — live plan shows **3× `TACTICAL_HOLD`** rows matching `psql` inactive count `3`.  
- **`/api/health` returns 16 checks** with JSON 200 while DB healthy.  
- **Continuity metadata** present on plan (`droppedFunds`, `unchangedFundsCount`, …) from `allocationPlanner.ts`.  
- **Alert dedup module** implements `fireCount` increments instead of duplicate rows for same `alertKey` while dismissed within 30d.

---

## Recommended V5.1 hardening plan

1. **Single-book accounting (HIGH cluster)** — Fix **F2.1 + F3.1** together: one canonical INR→CZK path for **net worth, allocation, and planner cash**. Extend **F2.2** so India accounts affect displayed allocation or explicitly label “Czech funds only”.  
2. **Truthful performance metrics (HIGH/MEDIUM)** — Rework **F2.3 / F2.5** presentation; tighten MoM window (**F2.4**).  
3. **Plan integrity & lessons (HIGH)** — Add tests + regen story for **F1.1 / F3.2**; optionally block far-future months (**F12.3**).  
4. **Security + retention (HIGH/MEDIUM)** — Address **F10.1**, **F11.1**, **F11.2**.  
5. **Ops / observability (MEDIUM)** — Improve **F6.1 / F6.2 / F8.1**, add fault-injection suite (**F9.x**).  
6. **Knowledge layer polish (LOW/MEDIUM)** — Pattern citations QA (**F12.1**), backtest golden tests (**F12.2**).

**Rough effort:** 1–2 weeks engineering for items 1–3; +1 week for 4–6 depending on crypto/KeyVault choice.
