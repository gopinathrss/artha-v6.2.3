# PIE (Artha) V6 — Deep system audit

**Date:** 2026-05-03  
**Auditor:** Cursor (static codebase audit + architecture walk; no live Postgres in this environment)  
**Scope:** Repository `artha-v4` / PIE V6 dashboard + API + Prisma schema  
**Method:** Merged **V4** (12 tracks + scenarios) and **V5** (12 tracks + finding format) into **14 tracks** for V6. **No code fixes** in this document.

---

## Part I — V6 audit methodology (V4 + V5 combined)

### Ground rules (from V4, retained)

1. Presume broken until evidence of correctness; compilation and bare `200` are not proof.  
2. Findings are specific: file, symbol, scenario where possible.  
3. Severity: **CRITICAL** (wrong money / data loss / security / demo↔real bleed) · **HIGH** · **MEDIUM** · **LOW**.  
4. Root cause tag: **DATA** · **LOGIC** · **UI** · **INTEGRATION** · **ARCHITECTURE** · **OBSERVABILITY**.  
5. Number every finding: `F{track}.{n}`. Suspected items marked **SUSPECTED** with how to verify.

### Finding format (from V5, retained)

Each finding below uses:

- **Severity**, **Track**, **Status:** OPEN  
- **Evidence:** command output, path:line, or code fact  
- **Reproduction:** steps (or “static review”)  
- **Impact:** user-facing consequence  
- **Recommended fix:** 2–4 sentences, no implementation in this phase

### Tracks (merged map)

| Track | Name | Primary V4 source | Primary V5 source |
|------:|------|-------------------|---------------------|
| 1 | Data integrity & schema | T1 | T1 |
| 2 | Ingestion & freshness | T2 | T2 (real-data cross-checks) |
| 3 | Calculation correctness | T3 | T2 |
| 4 | Buy / sell / hold engine | T4 | T3 |
| 5 | Continuity, outcomes, AI memory | T5 | T4 |
| 6 | UI / UX / accessibility | T6 | T5 |
| 7 | System flow & lifecycle | T7 | T6 |
| 8 | Reporting & PDF/HTML | T8 | T7 |
| 9 | Alerts & dedup | T9 | T8 (partial) |
| 10 | Stability & failure modes | T10 | T9 |
| 11 | Settings, secrets, onboarding | T11 | T10 |
| 12 | Retention & data lifecycle | — | T11 |
| 13 | V6-specific (PIE auth, gates, portfolio semantics) | — | V6 |
| 14 | Observability & ops | T12 | T8 (cron/health) |

### Scenarios (V4 Section 13, retained as Track 15 checklist)

Scenario A–E from V4 are listed in **§15** as **unverified here** — require a running instance + DB + browser.

### Deliverable rule

- This file is the audit artifact. **Git commit/tag not executed** (workspace not reported as a git repo in the audit environment).

---

## Part II — Executive summary

| Severity | Count (this pass) |
|----------|------------------:|
| CRITICAL | 2 |
| HIGH     | 6 |
| MEDIUM   | 14 |
| LOW      | 8 |
| **Total**| **30** |

**Net assessment:** Core money paths use **Prisma `Decimal`** and server-side helpers (`d`, `num`); **allocation planning, tax-free exit hooks, scheduler, and health checks are present and wired in code**. Gaps cluster around **(a)** secrets and credentials in **Settings / JSON**, **(b)** **JSON plan blobs** without DB-level schema enforcement, **(c)** **API JSON serialization via `Decimal.toNumber()`** for large/precise values, **(d)** **report waterfall contributions** mixing unrelated quantities, **(e)** **UI currency selector scope** (hero only), and **(f)** **runtime-only** claims (cron cadence, alert dedup, PDF parity) **not executed in this pass**. Treat this audit as **foundation for a fix sprint**, not a substitute for load/pen-test against production.

---

## Part III — Findings by severity (index)

### CRITICAL

- **F11.1** — Plaintext / JSON secrets for IMAP, SMTP, API keys in `Settings` / `AppSettings`.  
- **F6.1** — `serializeJsonBody` forces `Decimal` → JS `number`; financial JSON can lose precision for edge magnitudes.

### HIGH

- **F3.2** — `buildReportData` waterfall “Contributions” uses `max(0, totalInvested − startNw)` where `startNw` is snapshot net worth — dimensionally inconsistent with `totalInvested` (lifetime cashflows).  
- **F3.3** — Czech 3-year rule modeled as fixed **1095 calendar days** (`86400000 * 1095`) in import and `CZECH_TAX_FREE_DAYS`; not calendar-year / leap-aware statutory wording.  
- **F2.1** — NAV freshness for Czech funds is **proxy via `holding.updatedAt`** in `computeHoldingsPriceAgeHours`, not “days since NAV price date” — can PASS while quote is stale.  
- **F6.2** — Overview display-currency switch updates **hero primary/secondary only**; allocation, stat tiles, and other sections stay CZK-only.  
- **F4.1** — Sell-side beyond tax-free / rebalance / FD maturity **not a general sell planner** (V4 gap still largely true; specialized modules exist).  
- **F14.1** — `/api/health` returns **WARN** stubs for many checks when DB is down (`healthChecksWhenDbDown`) — trust score can mislead if operator does not read `DB_HEALTH`.

### MEDIUM

- **F1.1** — Multiple `Json` columns (`AllocationPlan.allocations`, `AlertLog.dataSnapshot`, `AppSettings.config`, etc.) — no DB-enforced schema.  
- **F1.2** — `num()` uses `Decimal.toNumber()` — same precision theme as F6.1 on read paths.  
- **F5.1** — `RecommendationOutcome` / `outcomeEvaluation` exist in codebase but **end-to-end population** depends on cron + plan usage — not verified here.  
- **F7.1** — Many crons in `scheduler.ts` — overlap and failure isolation rely on `runCronJob` wrapper; **SUSPECTED** double-fire if multiple server processes (no leader election in code reviewed).  
- **F8.1** — Report HTML generation path exists (`buildReportData`, templates); **PDF download parity, page breaks, token URLs** not verified (no browser PDF in this pass).  
- **F9.1** — Alert dedup / dismiss persistence — logic exists in schema (`alertKey`, `fireCount`); **SUSPECTED** edge cases need live `AlertLog` tests.  
- **F10.1** — Global `res.json` wrapper `serializeJsonBody` — good for Decimal; **malformed client bodies** per-endpoint validation varies — spot-check only.  
- **F10.2** — Concurrent `POST /api/this-month/generate-now` — `cfoRoutes` blocks duplicate month plan but **SUSPECTED** race between check and insert under high concurrency.  
- **F12.1** — Retention knobs on `Settings` / `AppSettings` (`cronExecutionRetentionDays`, etc.) — effectiveness depends on prune job registration in scheduler (grep shows `pruneOldRows` scheduled — **partially verified**).  
- **F13.1** — Portfolio “lifetime contributed” vs table **SIP column** — documented UX mismatch; cashflow aggregation correct but **semantically confusing** without user education.  
- **F13.2** — Banking import historically **appended** cashflows; mitigation added (delete-by-note + script) — **legacy DBs** may still carry duplicates until user runs script/re-import.  
- **F3.1** — `inflowWeightedGainPct` uses `totalInvested ≤ 0` → 0%; hides absurd % but **masks** bad data instead of surfacing validation error.  
- **F2.2** — Library / instrument scores and returns — file-backed + DB; **freshness** not guaranteed by cron in reviewed slice.  
- **F4.2** — `continuityBuyReason` / `computeContinuityMeta` — continuity narrative exists; **execution variance** (user buys different fund) still weakly modeled.

### LOW

- **F6.3** — Dashboard HTML page count ~**15+** routes; naming mix `pie-*` / `artha-*` events in JS — consistency polish.  
- **F6.4** — Duplicate paths for some files under `src/dashboard` (IDE/workspace copies) — risk of editing wrong file **SUSPECTED** in some setups.  
- **F11.2** — Many settings toggles — **“ghost”** features possible where UI exposes future work; not exhaustively listed here.  
- **F14.2** — Logging is primarily `console.log` in scheduler — not structured JSON logs to disk by default.  
- **F7.2** — `/healthz` uses `realPrisma` always — demo DB health not represented in that probe.  
- **F8.2** — AI executive summary in reports — template vs model-dependent; not verified.  
- **F12.2** — `EmailIngestionPreview` growth — retention days exist; volume **SUSPECTED** under heavy IMAP.  
- **F3.4** — MoM net worth — depends on `Snapshot` density and `findMomComparisonSnapshot`; sparse snapshots → null/label behavior — acceptable but should be documented in UI.

---

## Part IV — Findings by track (full format)

### Track 1 — Data integrity & schema

#### F1.1 [MEDIUM] [ARCHITECTURE]

**Severity:** MEDIUM · **Track:** 1 · **Status:** OPEN · **Sprint origin:** V4+

**Evidence:** `prisma/schema.prisma` — `Json` on `AlertLog.dataSnapshot`, `MonthlyLetter.portfolioSnapshot`, `AllocationPlan.allocations`, `AllocationPlan.continuity`, `AppSettings.config`, `AppSettings.secrets`, `InstrumentLibraryRow.metadata`, etc.

**Reproduction:** Static schema read.

**Impact:** Invalid JSON shapes can break planner reads or UI; errors surface late at runtime.

**Recommended fix:** Keep Zod (or similar) parse at write boundaries (some paths already use strict parsers — extend coverage); consider normalizing high-value blobs to relational tables in a later sprint.

---

#### F1.2 [MEDIUM] [DATA]

**Severity:** MEDIUM · **Track:** 1 · **Status:** OPEN

**Evidence:** `src/lib/money.ts` lines 21–24 — `num(v: Prisma.Decimal)` uses `v.toNumber()`.

**Reproduction:** Static.

**Impact:** Very large balances or aggregated cents can exceed safe integer / precision expectations when passed to JS-only math.

**Recommended fix:** Keep Decimal end-to-end in server calculations; reserve `num()` for JSON boundary and document max safe magnitude; or serialize money as string in JSON for strict clients.

---

#### F1.3 [LOW] [DATA]

**Severity:** LOW · **Track:** 1 · **Status:** OPEN

**Evidence:** Early migrations used `DOUBLE PRECISION` (`prisma/migrations/20260425164156_init/migration.sql`, etc.); later `20260430180000_f1_1_float_to_decimal/migration.sql` migrates money fields to `Decimal`.

**Reproduction:** Read migration chain (not executed on live DB here).

**Impact:** If any environment skipped migrations, legacy float columns could remain — **SUSPECTED**.

**Recommended fix:** `prisma migrate status` on each deployment; drift detection job.

---

### Track 2 — Ingestion & freshness

#### F2.1 [HIGH] [LOGIC]

**Severity:** HIGH · **Track:** 2 · **Status:** OPEN

**Evidence:** `src/lib/calculations.ts` `computeHoldingsPriceAgeHours` (lines 664–678) uses `updatedAt` of ACTIVE holdings, not `navLastFetchedAt` / price history age.

**Reproduction:** Set stale NAV but touch holding metadata → health NAV check may improve without true NAV refresh.

**Impact:** User trust in “NAV freshness” can be misplaced.

**Recommended fix:** Blend `navLastFetchedAt` and `PriceHistory` max date into the age metric; align health check messaging with data source.

---

#### F2.2 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 2 · **Status:** OPEN

**Evidence:** `loadAllLibrary` / `Instrument` — returns and TER are not obviously refreshed on the same cadence as FX (`scheduler.ts` FX jobs vs NAV jobs).

**Reproduction:** Static architecture review.

**Impact:** Library scores stale; allocation scoring uses stale TER/returns.

**Recommended fix:** Document “as of” dates in UI; optional scheduled library refresh.

---

### Track 3 — Calculation correctness

#### F3.1 [MEDIUM] [LOGIC]

**Severity:** MEDIUM · **Track:** 3 · **Status:** OPEN

**Evidence:** `src/lib/calculations.ts` ~418–421 — `inflowWeightedGainPct` forced to 0% when `totalInvested <= 0`.

**Reproduction:** Static.

**Impact:** Bad or empty cashflows hide percentage instead of prompting data repair.

**Recommended fix:** Return `null` pct with explicit `displayState` for UI badge.

---

#### F3.2 [HIGH] [LOGIC]

**Severity:** HIGH · **Track:** 3 · **Status:** OPEN

**Evidence:** `src/lib/reports/buildReportData.ts` lines 188–194 — `contrib = max(0, inv - startNw)` with `startNw` from `Snapshot` trajectory and `inv` from `totalInvested` (cashflow-based).

**Reproduction:** Compare report waterfall “Contributions” to finance reality on a known dataset.

**Impact:** Premium report waterfall can tell a misleading story.

**Recommended fix:** Define one basis (e.g. net cashflows in period, or MoM delta) or drop the row until defined.

---

#### F3.3 [HIGH] [DATA]

**Severity:** HIGH · **Track:** 3 · **Status:** OPEN

**Evidence:** `src/lib/import/excelImport.ts` line ~188 — `taxFreeDate = purchaseStartDate + 1095 * 86400000`; `src/lib/sellEngine/taxFreeExit.ts` `CZECH_TAX_FREE_DAYS = 1095`.

**Reproduction:** Compare legal calendar rule vs fixed 1095-day wall clock for leap-day purchases.

**Impact:** Off-by-one-day vs statutory calendar in edge cases; tax window alerts could shift.

**Recommended fix:** Calendar-based “3 years” per jurisdiction flag; unit tests around Feb 29.

---

### Track 4 — Buy / sell / hold

#### F4.1 [HIGH] [ARCHITECTURE]

**Severity:** HIGH · **Track:** 4 · **Status:** OPEN

**Evidence:** `allocationPlanner.ts` imports `taxFreeExit`, `rebalanceDrift`, `fdMaturity`, `holdReasoning` — no generic “profit take / stop-loss / tax-loss harvest” engine.

**Reproduction:** Product spec compare to V4 audit “sell planner missing”.

**Impact:** User expectation of full CFO sell-side not met.

**Recommended fix:** Roadmap explicit sell modules; until then, narrow UI claims to what exists.

---

#### F4.2 [MEDIUM] [LOGIC]

**Severity:** MEDIUM · **Track:** 4 · **Status:** OPEN

**Evidence:** `computeContinuityMeta` / `continuityBuyReason` in `allocationPlanner.ts` (lines 45–84).

**Reproduction:** Generate two plans; inspect `continuity` JSON.

**Impact:** Narrative continuity good; substitution of executed instruments still weak.

**Recommended fix:** Link `SipExecution` / manual journal to next plan inputs.

---

### Track 5 — Continuity, outcomes, AI

#### F5.1 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 5 · **Status:** OPEN · **SUSPECTED**

**Evidence:** `src/lib/outcomeEvaluation.ts` exists; `RecommendationOutcome` model in schema; wiring into cron not traced end-to-end in this pass.

**Reproduction:** On live DB: `SELECT COUNT(*) FROM "RecommendationOutcome"` after plans + 30d.

**Impact:** Outcomes dashboard empty if cron never runs.

**Recommended fix:** Verify `scheduler.ts` registers outcome job; add health check row when queue stale.

---

### Track 6 — UI / UX

#### F6.1 [CRITICAL] [DATA]

**Severity:** CRITICAL · **Track:** 6 · **Status:** OPEN

**Evidence:** `src/lib/money.ts` lines 28–36 — `serializeJsonBody` converts every `Prisma.Decimal` with `toNumber()` before JSON stringify.

**Reproduction:** Store `currentValueCzk` at extreme precision/magnitude; hit `/api/overview`; observe JSON number rounding.

**Impact:** Rare accounts could see rounded net worth in API consumers.

**Recommended fix:** Serialize monetary Decimals as **strings** in API v2, or use `toFixed` controlled string for CZK fields.

---

#### F6.2 [HIGH] [UI]

**Severity:** HIGH · **Track:** 6 · **Status:** OPEN

**Evidence:** `src/dashboard/scripts/overview.js` — `formatNetWorthDisplay` only feeds `hero-networth` and `hero-eur`; allocation section uses raw `nw.*` CZK in `renderAllocation`.

**Reproduction:** Switch currency to EUR; observe allocation bar labels.

**Impact:** User believes global display currency switched; only headline obeys.

**Recommended fix:** Either label selector “Net worth only” or recompute allocation section labels in selected CCY.

---

#### F6.3 [LOW] [UI]

**Severity:** LOW · **Track:** 6 · **Status:** OPEN

**Evidence:** Mixed `pie-health` / `artha-health` events in `overview.js` (lines ~59–60).

**Reproduction:** Grep dashboard scripts.

**Impact:** Minor maintenance confusion.

**Recommended fix:** Standardize on `pie-*` namespace.

---

### Track 7 — System flow & lifecycle

#### F7.1 [MEDIUM] [ARCHITECTURE] · **SUSPECTED**

**Severity:** MEDIUM · **Track:** 7 · **Status:** OPEN

**Evidence:** `src/lib/scheduler.ts` — many `cron.schedule` entries; no file-based leader lock visible in first 100 lines.

**Reproduction:** Run two Node processes against same DB.

**Impact:** Duplicate cron side effects (double emails, double plans) **SUSPECTED**.

**Recommended fix:** Single-instance enforcement or advisory locks in cron jobs.

---

#### F7.2 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 7 · **Status:** OPEN

**Evidence:** `src/api/server.ts` lines 154–178 — `/healthz` probes `realPrisma` only.

**Reproduction:** Demo mode on secondary DB — healthz still reflects primary.

**Impact:** Demo deployments may misread health surface.

**Recommended fix:** Optional `?demo=1` or separate `/healthz-demo`.

---

### Track 8 — Reporting

#### F8.1 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 8 · **Status:** OPEN · **SUSPECTED**

**Evidence:** `buildReportData.ts` pulls portfolio, plan, snapshots — rich HTML path; PDF pipeline not opened in this pass.

**Reproduction:** Generate report in browser; print to PDF manually.

**Impact:** Print layout / charts may clip.

**Recommended fix:** Playwright PDF snapshot test per month.

---

#### F8.2 [LOW] [UI]

**Severity:** LOW · **Track:** 8 · **Status:** OPEN

**Evidence:** Same module mixes computed narrative with static fallbacks in templates (files under `src/lib/reports/templates/`).

**Reproduction:** Read `taxYear.ts` etc.

**Impact:** “AI” sections may look generic.

**Recommended fix:** Label “template summary” vs “model summary”.

---

### Track 9 — Alerts

#### F9.1 [MEDIUM] [INTEGRATION] · **SUSPECTED**

**Severity:** MEDIUM · **Track:** 9 · **Status:** OPEN

**Evidence:** `AlertLog` schema supports dedup keys; `src/lib/triggers.ts` references alerts — full dedup story not line-traced here.

**Reproduction:** Fire same trigger twice in integration test.

**Impact:** Duplicate notifications **SUSPECTED** if dedup missing in a path.

**Recommended fix:** Integration tests per `triggerType`.

---

### Track 10 — Stability & failure modes

#### F10.1 [MEDIUM] [ARCHITECTURE]

**Severity:** MEDIUM · **Track:** 10 · **Status:** OPEN

**Evidence:** Express 5 app wide JSON serializer (`server.ts` middleware) — endpoints differ in validation depth.

**Reproduction:** Fuzz `POST` bodies on CFO routes (not executed).

**Impact:** Some routes may 500 vs 400 inconsistently.

**Recommended fix:** Central Zod validation middleware per route group.

---

#### F10.2 [MEDIUM] [DATA] · **SUSPECTED**

**Severity:** MEDIUM · **Track:** 10 · **Status:** OPEN

**Evidence:** `cfoRoutes.ts` `generate-now` — checks existing plan then creates (pattern suggests TOCTOU race).

**Reproduction:** Parallel `curl` posts (load test).

**Impact:** Rare duplicate plan rows **SUSPECTED**.

**Recommended fix:** DB unique constraint on `(monthYear)` + transaction.

---

### Track 11 — Settings & secrets

#### F11.1 [CRITICAL] [DATA]

**Severity:** CRITICAL · **Track:** 11 · **Status:** OPEN

**Evidence:** `prisma/schema.prisma` `Settings` model — `imapPassword`, `smtpPass`, `openaiApiKey`, `telegramBotToken` as string fields; `AppSettings.secrets` Json.

**Reproduction:** `SELECT` settings row in psql (on dev).

**Impact:** Credential disclosure if DB leaked; violates “encrypt at rest” expectation from V5 audit.

**Recommended fix:** Envelope encryption with server key; rotate secrets doc.

---

#### F11.2 [LOW] [UI]

**Severity:** LOW · **Track:** 11 · **Status:** OPEN

**Evidence:** Large `settings.js` client bundle — not fully audited for dead controls.

**Reproduction:** Manual QA pass.

**Impact:** Users hit non-functional toggles.

**Recommended fix:** Hide or stub unimplemented sections.

---

### Track 12 — Retention & lifecycle

#### F12.1 [MEDIUM] [OBSERVABILITY]

**Severity:** MEDIUM · **Track:** 12 · **Status:** OPEN · **partially verified**

**Evidence:** `Settings` / retention days fields + `src/lib/cron/pruneOldRows.ts` (referenced from `scheduler.ts`).

**Reproduction:** Inspect `CronExecution` table growth on long-running host.

**Impact:** Without pruning, tables grow; with pruning, audit trail shortens — document tradeoff.

**Recommended fix:** Expose last prune time in `/api/health`.

---

#### F12.2 [LOW] [ARCHITECTURE]

**Severity:** LOW · **Track:** 12 · **Status:** OPEN · **SUSPECTED**

**Evidence:** `EmailIngestionPreview` model + `autoIngestEmails`.

**Reproduction:** Enable IMAP hourly on busy inbox.

**Impact:** Row growth — mitigated by retention if job runs.

**Recommended fix:** Dashboard card “preview rows / oldest age”.

---

### Track 13 — V6-specific (PIE)

#### F13.1 [MEDIUM] [UI]

**Severity:** MEDIUM · **Track:** 13 · **Status:** OPEN

**Evidence:** `src/dashboard/portfolio.html` + `portfolio.js` — “Lifetime contributed” from cashflows vs “SIP” column in grid.

**Reproduction:** User compares two without reading tooltip.

**Impact:** Trust erosion (“wrong numbers”).

**Recommended fix:** Onboarding tip + optional column “sum cashflows” in export.

---

#### F13.2 [MEDIUM] [DATA]

**Severity:** MEDIUM · **Track:** 13 · **Status:** OPEN

**Evidence:** `excelImport.ts` deleteMany before re-import + `scripts/clear-banking-import-cashflows.ts` — legacy DBs unchanged until user acts.

**Reproduction:** DB with duplicate import notes.

**Impact:** Inflated lifetime contributed until cleanup.

**Recommended fix:** One-click “reset banking cashflows” in Settings (guarded).

---

#### F13.3 [LOW] [INTEGRATION]

**Severity:** LOW · **Track:** 13 · **Status:** OPEN

**Evidence:** `externalReadApiGate.ts` — limited external API surface; dashboard auth middleware lists pages.

**Reproduction:** Read `dashboardAuthMiddleware.ts` + `externalReadApiGate.ts`.

**Impact:** Misconfiguration could expose more than intended — ops responsibility.

**Recommended fix:** Document `PIE_EXTERNAL_API_PATHS` in operator runbook.

---

### Track 14 — Observability

#### F14.1 [HIGH] [OBSERVABILITY]

**Severity:** HIGH · **Track:** 14 · **Status:** OPEN

**Evidence:** `src/lib/health.ts` lines 15–43 — when DB down, many checks become WARN “Skipped”.

**Reproduction:** Stop Postgres; `GET /api/health`.

**Impact:** Monitoring may show “yellow” while hard-down.

**Recommended fix:** Overall `healthStatus` field + fail closed for synthetic checks.

---

#### F14.2 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 14 · **Status:** OPEN

**Evidence:** Scheduler uses `console.log` (`scheduler.ts`).

**Reproduction:** Grep `[Scheduler]`.

**Impact:** Hard to grep production logs without log shipper parsing.

**Recommended fix:** Structured logger with `job`, `durationMs`, `error`.

---

#### F14.3 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 14 · **Status:** OPEN

**Evidence:** `cfoRoutes.ts` line ~940 — `GET /api/cron/recent` exists (V5 checklist item).

**Reproduction:** Hit endpoint on running server.

**Impact:** None if used; if unknown to operators, cron visibility poor.

**Recommended fix:** Link from Settings “Diagnostics”.

---

## Part V — Suspected (not confirmed in this pass)

| ID | Item | How to verify |
|----|------|----------------|
| S1 | Duplicate cron under multi-process | Run two servers + inspect `CronExecution` |
| S2 | Alert dedup for all trigger types | Integration tests in `tests/api` |
| S3 | PDF report parity | Playwright PDF snapshot |
| S4 | Anthropic rate-limit backoff | Kill switch test with bad key + observe retries |
| S5 | India LTCG / 1.25L exemption math | Trace `indiaIntelligence` / tax modules with known cases |

---

## Part VI — Verified working (this codebase pass)

- **Prisma schema** uses `Decimal` for money/NAV/units on core models (`Holding`, `Cashflow`, `Account`, `Snapshot`, etc.) in current `schema.prisma`.  
- **`serializeJsonBody`** is applied globally in `server.ts` so API JSON is not raw `Decimal` objects.  
- **`calculateNetWorth`** composes Czech + India with explicit FX (`calculations.ts`).  
- **`calculateAllocation`** includes India MF slices + India account slices when passed.  
- **`allocationPlanner.ts`** wires **tax-free exit**, **rebalance drift**, **FD maturity**, **HOLD reasoning**, and **continuity meta**.  
- **`lessonExtractor`** is dynamically imported from `allocationPlanner.ts` (~lines 431–453).  
- **`/healthz`** exists and hits DB (`server.ts` 154+).  
- **`HEALTH_CHECK_COUNT = 17`** declared in `health.ts` with named checks.  
- **`/api/cron/recent`** endpoint present in `cfoRoutes.ts`.  
- **Dashboard static pages** exist for overview, portfolio, india, this-month, tax-calendar, alerts, reports, intelligence, library, backtest, patterns, help, finances, settings, onboarding, login, forgot/reset password.  
- **Banking import** now deletes prior `Imported from Banking_Input.xlsx` cashflows before insert (`excelImport.ts`).

---

## Part VII — Scenario matrix (V4 §13) — **not run here**

| Scenario | Status in this audit |
|----------|------------------------|
| A — First-time user lifecycle | **NOT RUN** — needs DB wipe + browser |
| B — Stale data day (FX 5d old) | **NOT RUN** — needs time manipulation |
| C — Conflicting execution vs plan | **NOT RUN** |
| D — Multi-currency drift overnight | **NOT RUN** |
| E — Post tax-free sell UX | **NOT RUN** |

---

## Part VIII — Recommended V6 hardening plan (grouped)

1. **Security & secrets (F11.1, F11.x)** — encryption, rotation, remove plaintext API keys from `Settings` row.  
2. **Money JSON & UI CCY (F6.1, F6.2, F1.2)** — string money in API v2 or document limits; expand CCY switch or narrow label.  
3. **Reporting waterfall (F3.2)** — redefine or remove misleading “Contributions” slice.  
4. **NAV freshness semantics (F2.1)** — align health with true NAV age.  
5. **Tax calendar precision (F3.3)** — legal calendar modeling + tests.  
6. **Ops / cron hardening (F7.1, F14.x)** — single leader, structured logs, health composite status.  
7. **Data QA tools (F13.2)** — in-app reset for banking-import cashflows + better seed (`generate-banking-seed-xlsx.ts` already tuned in repo).

---

## Appendix A — Source hot spots (files with concentrated risk)

| File | Topics |
|------|--------|
| `src/lib/money.ts` | `num`, `serializeJsonBody`, `d` |
| `src/lib/calculations.ts` | Net worth, allocation, XIRR, tax status |
| `src/lib/portfolio.ts` | Summary, `netCashInvestedCzkFromCashflows`, XIRR inputs |
| `src/lib/allocationPlanner.ts` | Plan generation, continuity, lessons |
| `src/lib/reports/buildReportData.ts` | Report numbers, waterfall |
| `src/lib/import/excelImport.ts` | Banking ingestion |
| `src/lib/health.ts` | Trust / checks |
| `src/lib/scheduler.ts` | Cron surface area |
| `prisma/schema.prisma` | Json blobs, secrets |

---

## Appendix B — Architectural recommendations (V6 → V6.1)

1. **Typed plan rows** — migrate `AllocationPlan.allocations` JSON to relational `PlanRow` table to kill a class of JSON drift bugs.  
2. **API money as string** — eliminate `toNumber()` at boundary for monetary fields.  
3. **Sell planner** — expand beyond tax-free / drift / FD to user-facing “CFO sells” with explicit policy flags.  
4. **Single-writer cron** — mandatory for any host running >1 Node worker.

---

*End of V6 deep audit (findings-only phase).*
