# ARTHA V4 Deep Audit — 2026-04-25  
**Automated verification pass:** 2026-04-30 (see [§ Automated audit run](#automated-audit-run-2026-04-30) below).

**Method:** Static code review of the repository as it exists today, plus CLI verification where the environment allowed. Original audit phase was **findings-only**; a **closure pass** on 2026-04-30 applied small **foundation** fixes so automated checks complete without a running Postgres on the audit machine (documented under [§ Post-audit remediation](#post-audit-remediation-closure-pass)). Runtime checks (browser TTFMP, PDF pixel proof, 24h heap, multi-tab) remain **UNVERIFIED (environment)** where the agent could not execute them.

**Evidence types used:** `file:line` citations, logic walkthroughs, and explicit **UNVERIFIED** where live DB, browser, or long-running processes were required.

---

## Executive summary

| Severity | Count (approx.) |
|----------|-----------------|
| **CRITICAL** | 9 |
| **HIGH** | 18 |
| **MEDIUM** | 22 |
| **LOW** | 12 |

**Net assessment:** V4 is a credible **prototype / single-user CFO shell**: allocation plans, adherence, AMFI ingest, FX pipelines, health checks, and reporting exist as code paths. **Money correctness and “single source of truth” are not guaranteed:** net worth and allocation ignore `IndiaMutualFund` while India pages and reports include them; money is stored as `Float`; RBI and some AI inputs are hardcoded or estimated; demo mode still mutates Postgres; there is no sell engine, no plan-vs-execution memory in the planner, and alerting duplicates without deduplication. **Hosting this as a production CFO without a foundation sprint would be unsafe.**

---

## Section 1 — Data integrity

**F1.1 [CRITICAL] [DATA]** All monetary and NAV fields use IEEE `Float` in Prisma, not `Decimal`, causing cumulative rounding and comparison hazards for money and tax boundaries. **Status 2026-05-01:** `docs/F1.1_FIELD_AUDIT.md` added (field inventory); Prisma `Decimal` migration and TS arithmetic refactor (**Parts C–F**) **not yet applied** — remains open.

- **Where:** `prisma/schema.prisma` — e.g. `Holding.units`, `Holding.nav`, `Holding.currentValueCzk` (lines 16–18), `Cashflow.amountCzk` (39), `Account.balanceLocal` / `balanceCzk` (50–52), `AllocationPlan` totals and `SipExecution.amountCzk` (306–308, 327), `FXRate.rate` (343), etc.
- **Evidence:** Schema uses `Float` throughout money-like columns.
- **Impact:** Silent cent-level drift; large portfolios amplify error; regulatory-style reporting is not bit-exact.

**F1.2 [HIGH] [DATA]** `AllocationPlan.allocations` and `userOverride` are untyped `Json` with no DB-level schema enforcement.

- **Where:** `prisma/schema.prisma` lines 311–314.
- **Evidence:** Application reads/writes arrays of row objects (`PlanAllocation` shape) only in TypeScript (`allocationPlanner.ts`, `cfoRoutes.ts` PATCH).
- **Impact:** Corrupt JSON, partial migrations, or manual DB edits can break dashboards without migration errors.

**F1.3 [HIGH] [DATA]** `SipExecution.planId` is optional (`String?`) with no Prisma relation to `AllocationPlan`, so orphan executions and weak referential integrity are possible.

- **Where:** `prisma/schema.prisma` lines 320–336; `POST /api/sip-executions` accepts `planId: b.planId || null` in `cfoRoutes.ts` (~537–541).
- **Impact:** Reporting and “which plan did this belong to?” become ambiguous.

**F1.4 [MEDIUM] [DATA]** Multiple `Json` blobs (`AlertLog.dataSnapshot`, `MonthlyLetter.portfolioSnapshot`, `AIMemory.portfolioSnapshot`, `GeneratedReport.dataSnapshot`, `AdvisorJournal.metadata`) store structured data without versioned schema in the DB.

- **Where:** `prisma/schema.prisma` 116–117, 130, 204–207, 396, 441.
- **Impact:** Forward compatibility and audits depend entirely on application code.

**F1.5 [HIGH] [ARCHITECTURE] [CLOSED 2026-05-01]** Two parallel FX histories: `FXRate` (written by `currency.fetchAllRates`) vs `PriceHistory` rows `FX_EURCZK` / `FX_EURINR` (written by `fetchers.getFXRates` / `saveFXToHistory`).

- **Where:** `prisma/schema.prisma` `FXRate` (338–347), `PriceHistory` (81–89); `src/lib/currency.ts` 117–126; `src/lib/fetchers.ts` 71–95.
- **Impact:** Different code paths can disagree on “latest FX”; health vs portfolio vs `convertCurrency` can diverge.

**F1.6 [HIGH] [DATA] — verified on audit machine (DB down)** `prisma migrate status` against `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/artha_v4` failed with **`P1001: Can't reach database server at localhost:5432`**. No migration table state could be read. **Action:** start the PostgreSQL Windows service (or your container) on **5432**, then run `node node_modules/prisma/build/index.js migrate status` from `artha-v4`. `prisma validate` **succeeded** (schema valid).

**F1.7 [MEDIUM] [OBSERVABILITY] — remediated in closure pass** Previously `GET /api/health` could return **500** when the DB was unreachable because `runHealthChecks` queried `fXRate` before a connectivity probe (`src/lib/health.ts`). **Now** the handler returns **12 checks** with `DB_HEALTH: FAIL` and `trustScore: 0` when `SELECT 1` fails — JSON **200** for observability probes.

---

## Section 2 — Data ingestion

**F2.1 [HIGH] [INTEGRATION]** AMFI `NAVAll.txt` ingestion: malformed lines are skipped silently; parser picks last numeric field on the line as NAV (`tryParseAmfiLine`).

- **Where:** `src/lib/amfiIngest.ts` 17–45, 75–82.
- **Evidence:** No structured error report per line; `byIsin.set` overwrites duplicates within same file (last wins).
- **Impact:** Wrong NAV possible for odd line shapes; same-day re-run yields `inserted: 0` but may still log PASS — “freshness” must not be inferred from insert count alone.

**F2.2 [MEDIUM] [DATA]** AMFI cron runs daily `30 14 * * *` **Asia/Kolkata** (`scheduler.ts` 211–231). Holdings not matched to any ingested ISIN simply keep stale `currentNavInr` / user NAV — no automatic link from `amfiCode` to `NavHistory` was verified in `portfolio` path.

**F2.3 [HIGH] [DATA]** Czech mutual fund / ETF NAV refresh: morning job updates `Holding.nav` only when `instrumentLibrary` has a matching `isin` **and** `ticker`, via Yahoo (`triggers.ts` 103–114, `fetchYahooPrice`).

- **Evidence:** No AMFI-like pipeline for CZ funds in repo; manual `nav` on `Holding` remains authoritative otherwise.
- **Impact:** “Sporobond”-style names depend on user edits or library tickers — **stale NAV risk** unless disciplined manually.

**F2.4 [CRITICAL] [LOGIC]** RBI “repo policy” rate used in AI context and India intelligence is **not fetched**: `fetchRBIRate` writes a constant `6.5` with source `RBI_REPOLICY_EST`.

- **Where:** `src/lib/indiaIntelligence.ts` 18–41; `src/lib/aiIntelligence.ts` 146–153 (`const rbi = 6.5`).
- **Impact:** Any guidance mentioning RBI rate can be wrong vs reality — classify as **wrong money-adjacent advice risk** if presented as live.

**F2.5 [HIGH] [INTEGRATION]** FX: `fetchers.getFXRates` returns `ageHours: 0` on “live” path even when using **just-fetched** CNB/ECB — OK — but on failure uses **hardcoded** `FALLBACK_RATES` with `ageHours: 999` (`fetchers.ts` 4–5, 65–68). Portfolio still computes.

- **Impact:** Net worth can show numbers with **unknowingly stale FX** unless UI surfaces `source` / `ageHours` everywhere (partially done via confidence — see F3.x).

**F2.6 [MEDIUM] [INTEGRATION]** `currency.convertCurrency` refuses FX older than **7 days** (`MAX_AGE_MS`, throws) — **different** tolerance than health confidence (24–48h) and scheduler “24h” bootstrap — see **F1.5** / **F3.12**.

**F2.7 [MEDIUM] [DATA]** Instrument library scores and returns: `seedLibraryWithTopETFs` runs at server boot (`server.ts` 559); `score` / `scoreUpdatedAt` in schema (`InstrumentLibrary` 193–194) are not continuously refreshed by market cron in reviewed code.

**F2.8 [HIGH] [OBSERVABILITY]** NRE FD card rates seeded once from static table `NRE_SEED` (`indiaIntelligence.ts` 45–77) with `source: 'BANK_CARDS_APR_2026'`. **No live scrape.**

**F2.9 [MEDIUM] [UI]** Manual entry surfaces: Czech holdings form (`settings.html` 110–127), India MF CRUD (`cfoRoutes.ts` 654+), FDs, income/expenses/events via finances APIs (not re-listed line-by-line here). **Frequency / staleness** is entirely user-driven — no automatic degradation except health widgets.

---

## Section 3 — Calculation correctness

**F3.1 [HIGH] [LOGIC]** XIRR is computed only from `Cashflow.amountCzk` plus terminal `currentValueCzk` sum (`portfolio.ts` 28–35; `calculations.ts` `calculateXIRR`). **Currency:** all flows are CZK; Indian SIPs in INR are not modeled as INR cashflows in this XIRR.

**F3.2 [MEDIUM] [LOGIC]** XIRR edge cases: `calculateXIRR` returns `null` with notes for no sign change, short history, etc. (`calculations.ts` 80–200). **Hand-checked golden vectors in this audit:** **UNVERIFIED** — unit tests may exist but were not re-run here (`npx` unavailable in agent shell).

**F3.3 [CRITICAL] [LOGIC] [REOPENED 2026-05-01 — POST field mapping bug + indiaCzk alias bug; both fixed]** Earlier closure was premature. Two regressions were found and fixed:

1. **`POST /api/india/mf`** accepted JSON `currentNav` / `avgNav` but did not map them to Prisma `currentNavInr` / `avgNavInr`, so NAVs were stored as **NULL** (`cfoRoutes.ts`). **Fix:** `indiaMfNavFromBody` coalesces `currentNav`↔`currentNavInr` and `avgNav`↔`avgNavInr` on POST/PATCH; GET list and fund payloads expose **`currentNav` / `avgNav`** aliases alongside DB fields.
2. **`indiaCzk` in `calculateNetWorth`** was incorrectly set to **`indiaMfCzk`** only. **`indiaCzk` must equal the full India CZK book** (`indiaTotal` = NRE + NRO + FD + MF). **Fix:** `indiaCzk: num(indiaTotal)` and comment update (`calculations.ts`).

**Post-fix smoke** (`scripts/smoke-f3.3-overview.ts`, DB `127.0.0.1:5544/artha_v4`, `deleteMany` on `IndiaMutualFund` then Prisma insert 1000×₹110 @ live FX):

- Baseline: `totalCzk` **0**, `indiaMfCzk` **0**, `indiaCzk` **0**, `indiaTotal` **0**.
- DB row: `currentNavInr` **110**, `avgNavInr` **100**, `units` **1000**.
- After insert: `totalCzk` **29126.13**, `indiaMfCzk` **29126.13**, `indiaCzk` **29126.13**, `indiaTotal` **29126.13** (all India buckets except MF were zero, so `indiaCzk === indiaTotal === indiaMfCzk` in this run).

**Regression tests:** `tests/unit/calculations.test.ts` (MF-only vs NRE+MF vs `totalCzk === czechTotal + indiaTotal`); `tests/api/india_mf.test.ts` (POST `currentNav`/`avgNav` → DB `*Inr` columns) when `ARTHA_TEST_DB_LIVE=1`.

**F3.4 [HIGH] [LOGIC]** `calculateAllocation` uses only `Holding` rows with `status === 'ACTIVE'` (`calculations.ts` 353–360). India wrapper / hybrid classification: `mapCategoryToBuckets` treats `MIXED` as 50/50 equity/bonds (318–324). **Wrapper holding one ETF** is still one `Holding` row — fine — but India MF exposure absent from holdings **breaks** bucket totals (coupled with F3.3).

**F3.5 [MEDIUM] [LOGIC] [CLOSED 2026-05-01]** MoM change uses **second latest** `Snapshot`, not “last calendar month” (`portfolio.ts` 74–83: `snapshots[1]`).

- **Impact:** MoM label vs user mental model may disagree after gaps in daily snapshots.

**F3.6 [MEDIUM] [DATA]** Daily snapshots written in `saveDailySnapshotFromPortfolio` (`triggers.ts` 44–82) depend on morning job success. If job fails, MoM and charts degrade silently.

**F3.7 [MEDIUM] [LOGIC]** Czech tax-free countdown: `calculateTaxStatus` uses `Math.round` of day difference (`calculations.ts` 477–485). Leap seconds / DST not modeled; “1095 vs 1096 days” rule is **not** calendar-year aware — uses stored `taxFreeDate` only.

**F3.8 [LOW] [LOGIC]** After `days <= 0`, urgency `'FREE'` (`calculations.ts` 484). Triggers use `daysUntilTaxFree <= 30` and `urgency !== 'FREE'` for approaching alerts (`triggers.ts` 21) — post-window, **no “you are tax-free, consider exit”** trigger from that path.

**F3.9 [MEDIUM] [LOGIC]** India LTCG badge: `>= 365` calendar days from `purchaseDate` (`indiaTax.ts` 29–32). **Not** fiscal-year-based; ELSS uses `+3` years (20–25). Comment states “not legal advice” — OK, but product may present as definitive.

**F3.10 [MEDIUM] [LOGIC]** `equityLtcgTaxInr` applies a flat exemption and rate (`indiaTax.ts` 11–14) — **not** tied to assessment year ledger, carry-forward, or grandfathering.

**F3.11 [MEDIUM] [LOGIC]** Adherence percentage = `done / (done + skipped)`; **pending rows excluded from denominator** (`adherence.ts` 98–99).

- **Impact:** 0% adherence with all-pending reads as 0; month “closed” only if user skipped/done all rows.

**F3.12 [HIGH] [LOGIC] [CLOSED 2026-05-01]** `calculateConfidence` in `getPortfolioSummary` passes **`fxResult.ageHours` twice** — second arg intended as `priceAgeHours` is wrong.

- **Where:** `src/lib/portfolio.ts` 46–50.
- **Impact:** Confidence score ignores actual price staleness signal from holdings.

---

## Section 4 — Buy / sell / hold logic

**F4.1 [HIGH] [ARCHITECTURE]** `buildMonthlyPlanPayload` (`allocationPlanner.ts` 85–222) computes income, fixed costs, event reserve, emergency top-up, then slices `investable` into equity/bond/cash rows from **top library** or **first matching holding** — no MPT, no liability matching, no tax optimization across jurisdictions.

**F4.2 [MEDIUM] [LOGIC]** Deficit (`investable < 0`): emits a single zero-amount “Review fixed costs” row (134–139). **No** structured liability plan.

**F4.3 [MEDIUM] [LOGIC]** If no `EQUITY` `Holding` but library has equity, still recommends top ETF (169–175). If **no** bond holding and **no** bond in library, bond sleeve omitted silently (178–196).

**F4.4 [LOW] [LOGIC]** `topEq` filter requires `(score ?? scoreInstrument(i)) > 0` (147). Instruments with score 0 are excluded — may skip valid funds.

**F4.5 [CRITICAL] [ARCHITECTURE]** **Sell planner does not exist.** Triggers list: tax window approaching (`TAX_FREE_APPROACHING`) and allocation drift (`ALLOCATION_DRIFT`) only (`triggers.ts` 13–40). **No** profit-taking, stop-loss, tax-loss harvesting, currency rebalance sell, FD ladder roll, or “exit now” workflow.

**F4.6 [MEDIUM] [UI]** “Hold” is implicit: no row type that says “hold for reason X”; default is absence of buy rows after deficit branch.

**F4.7 [HIGH] [LOGIC]** Execution variance: `markPlanRowDone` records `executedAmountCzk` optionally (`planRowUpdate.ts` 22–24). **Next month’s `buildMonthlyPlanPayload` does not read** prior plan or executed amounts — **no catch-up** math.

**F4.8 [HIGH] [DATA]** User buys a different fund than recommended: they can `SKIP` with reason and/or `POST /api/sip-executions` with arbitrary `isin` (`cfoRoutes.ts` 533–554). **No** link enforcing `isin` against plan row; planner does not ingest ad-hoc buys into holdings automatically.

---

## Section 5 — Recommendation continuity

**F5.1 [HIGH] [ARCHITECTURE]** `generateMonthlyPlan` / `buildMonthlyPlanPayload` **do not query** prior `AllocationPlan` rows.

- **Where:** `allocationPlanner.ts` — only current month inputs via Prisma (`findMany` income/expense/events) — no `getPlanForMonth(prev)`.

**F5.2 [MEDIUM] [LOGIC]** AI prompt includes `lastMemories(3)` only (`aiIntelligence.ts` 150–154), **not** structured last-3-month plan-vs-executed tables.

**F5.3 [MEDIUM] [LOGIC]** No logic: “rejected twice → stop recommending” for plan rows. Skipped rows are journalized (`cfoRoutes.ts` 435–442) but **not** fed back into planner.

**F5.4 [LOW] [ARCHITECTURE]** `RecommendationOutcome` model exists (`schema.prisma` 230–244) but **no** automated writer found in reviewed planner/AI paths (grep not run across entire repo — **potential** dead table).

---

## Section 6 — UI / UX / smoothness

**F6.1 [CRITICAL] [UI]** Demo mode banner says **“Settings still edit the real database”** (`settings.html` 10–12). **Demo APIs** return canned JSON for many reads but **writes** to profile/plan/etc. are blocked selectively — easy to misunderstand and **cross-contaminate** mental model vs data.

**F6.2 [MEDIUM] [UI]** Display currency: `ArthaUI.formatMoneyFromCzk` only affects elements explicitly switched to it (`artha-ui.js` 60–71). Any page that still uses raw `formatCZK` or server-rendered numbers **will not** switch — prior “partial” audit concern **remains by design** unless each page migrated.

**F6.3 [MEDIUM] [UI]** Loading states / skeletons: **not systematically verified** per page in browser (**UNVERIFIED**).

**F6.4 [LOW] [UI]** `btnTestTg` shows toast **“Telegram test not implemented yet”** (`settings.html` 521–523).

**F6.5 [LOW] [UI]** CSV **Import** button wired to toast **“Import not implemented”** (`settings.html` 525–527).

**F6.6 [MEDIUM] [ACCESSIBILITY]** Lock/unlock pattern disables controls but **full** WCAG audit not performed (**UNVERIFIED**).

**F6.7 [UNVERIFIED] [UI]** Mobile 375px overflow, dark/light parity on every widget, double-submit on plan buttons — require browser pass.

---

## Section 7 — System flow & initialization

**F7.1 [MEDIUM] [ARCHITECTURE]** Startup (`server.ts` 547–571): `ensureFreshRatesIfStale` → `seedLibraryWithTopETFs` → `seedNREFDRates` → conditional `fetchRBIRate` → `startScheduler` → `startTelegramBot`. **Failures are caught and logged**; server still listens — **partial init** possible.

**F7.2 [HIGH] [INTEGRATION]** If DB unreachable, `isDemoMode` catches and returns default (`server.ts` 54–60), but Prisma-backed routes will still fail at runtime — **no** global circuit breaker page.

**F7.3 [MEDIUM] [INTEGRATION]** Anthropic/OpenAI invalid keys: AI calls fail into `AIMemory` with error text (`aiIntelligence.ts` 220–232) — **no** startup validation.

**F7.4 [MEDIUM] [INTEGRATION]** SMTP misconfig: email sends fail per call; scheduler logs plan email errors (`scheduler.ts` 157–160).

**F7.5 [MEDIUM] [OBSERVABILITY]** No `/healthz` literal route in reviewed `server.ts` header; CFO exposes **`GET /api/health`** (`cfoRoutes.ts` 62–77). Naming mismatch for k8s probes unless aliased.

**F7.6 [MEDIUM] [LOGIC]** Salary auto-plan cron: fires when `dayOfMonth === profile.salaryDayOfMonth + 1` (`scheduler.ts` 129–136) at 06:00 Prague — **day after** salary. Document for ops; mismatches user expectation if they assumed “on salary day”.

**F7.7 [LOW] [ARCHITECTURE]** Multi-tab: display currency in `localStorage` (`artha-ui.js` 63) — tabs on same origin **do not sync** automatically.

---

## Section 8 — Reporting

**F8.1 [MEDIUM] [LOGIC]** Report snapshot is **point-in-time** at `buildReportData` execution; HTML view renders stored JSON (`reportsService.ts` 88–108). **Not live-updating** after generation.

**F8.2 [LOW] [DATA]** Report token: `crypto.randomBytes(24).toString('hex')` (`reportsService.ts` 56) — **48 hex chars**, unguessable in practice. **No expiry** in schema (`GeneratedReport` has `token` unique, no `expiresAt`).

**F8.3 [MEDIUM] [UI]** Same month can be generated multiple times — each `createReport` inserts a new row (`reportsService.ts` 66–75) — **duplicate reports** possible.

**F8.4 [MEDIUM] [LOGIC]** Client audience obfuscates names (`buildReportData.ts` `escClient`, plan row labels) but **INTERNAL** still embeds rich JSON in premium template — review exfiltration policy before sharing URLs.

**F8.5 [UNVERIFIED] [UI]** “Download PDF” / print CSS, chart rendering, and page breaks — require manual print-to-PDF from browser in your environment.

---

## Section 9 — Alert system

**F9.1 [MEDIUM] [DATA]** Alert types implemented in code path reviewed: `TAX_FREE_APPROACHING`, `ALLOCATION_DRIFT` (`triggers.ts` 13–40). **No** dedicated rows for: SIP missed, NAV stale >7d, FX stale >24h, plan deficit, FD renewal, LTCG threshold, DTAA filing — some appear as **health checks** / digest text elsewhere but **not** unified alert taxonomy.

**F9.2 [HIGH] [LOGIC]** Each morning job creates **new** `AlertLog` rows for every firing trigger without dedupe keys (`triggers.ts` 127–137).

**F9.3 [MEDIUM] [INTEGRATION]** `deliverAlert` sends email if `alertEmail` set; **Telegram** not updated in this function (email-only path) (`triggers.ts` 151–167) — separate digest at 08:00 (`scheduler.ts` 179–206).

**F9.4 [MEDIUM] [LOGIC]** Email send errors swallowed (`.catch(() => {})` on `sendEmail` in `deliverAlert`), yet `wasSent` may still update depending on path — **verify** `sendEmail` contract (not fully expanded here).

**F9.5 [LOW] [UI]** No user-dismiss persistence field on `AlertLog` model in schema — “dismiss” behavior **not present** as first-class data.

---

## Section 10 — Stability & error handling

**F10.1 [MEDIUM] [INTEGRATION]** Express JSON parser limit `10mb` (`server.ts` 20) — large payloads accepted; per-field validation varies by route (`cfoRoutes` uses ad-hoc checks on some bodies).

**F10.2 [HIGH] [OBSERVABILITY]** Anthropic path: `catch { textOut = undefined }` with **no logged reason** (`aiIntelligence.ts` 189–203) — rate limits and parse errors are indistinguishable.

**F10.3 [MEDIUM] [ARCHITECTURE]** OpenAI path has no retry/backoff visible in same function (`aiIntelligence.ts` 206–217).

**F10.4 [LOW] [ARCHITECTURE]** Multi-user: single `UserProfile` id `'default'` pattern — **assumption: one user per DB**.

**F10.5 [UNVERIFIED] [DATA]** `AIMemory` table growth: no pruning strategy verified — **potential** unbounded growth.

**F10.6 [UNVERIFIED] [DATA]** 24h memory leak / heap — not measured.

---

## Section 11 — Settings page usability

**F11.1 [HIGH] [UI]** Demo + real DB warning (**F6.1**).

**F11.2 [MEDIUM] [UI]** Import CSV / Telegram test explicitly not implemented (`settings.html` 521–527).

**F11.3 [MEDIUM] [ARCHITECTURE]** Missing settings implied by product vision (from audit brief): AMFI code browser, NAV refresh frequency, alert threshold tuning, decimal formatting prefs, AI model picker in UI (keys exist server-side / env), backup frequency beyond weekly placeholder, theme auto vs system (only light/dark toggle in `artha-ui.js` 4–14).

**F11.4 [MEDIUM] [LOGIC]** Targets sliders client-validates sum to 100% before save (`settings.html` 442–448); server must also validate — **not verified** in this read (`POST /api/settings` handler not expanded).

---

## Section 12 — Observability

**F12.1 [MEDIUM] [OBSERVABILITY]** Logging is primarily `console.log` / `console.error` in scheduler and server (`scheduler.ts`, `server.ts`).

**F12.2 [LOW] [OBSERVABILITY]** `SystemHealth` rows written on AMFI success (`amfiIngest.ts` 100–108) — good, but **not** a full execution trace (duration, row diff).

**F12.3 [MEDIUM] [OBSERVABILITY]** No `/metrics` (Prometheus) route found in reviewed files.

**F12.4 [MEDIUM] [OBSERVABILITY]** Answering “did salary cron fire on May 16?” requires log grep for `[Scheduler] Daily salary check` / `Auto-generating plan` — **no** persisted cron ledger table.

**F12.5 [LOW] [OBSERVABILITY]** AI cost per call **not** logged in `askArtha`.

---

## Section 13 — End-to-end scenarios (code-level expectations)

**Scenario A — First-time user lifecycle**  
**UNVERIFIED end-to-end** (needs clean DB + browser). Code suggests: onboarding flow (`onboardingRun.ts`), plan generation on complete, row PATCH → `markPlanRowDone` / journal / `SipExecution`. **Risk:** India MF not in net worth (**F3.3**) undermines “full lifecycle” correctness.

**Scenario B — Stale data day**  
Partial: `calculateConfidence` downgrades stale FX ages; `convertCurrency` hard-stops after 7 days; health checks surface FX/NAV ages (`health.ts` 11–31). **No** global “block all recommendations” gate found in planner — **HIGH** product gap.

**Scenario C — Conflicting recommendation**  
SKIP + manual `SipExecution` possible; planner **does not** reconcile (**F4.7**, **F5.1**).

**Scenario D — Multi-currency drift**  
Allocation recompute uses latest `Holding.currentValueCzk` and FX-derived accounts (`calculateNetWorth`, `calculateAllocation`). If prices stale, drift detection is stale. **No** “currency drift” alert separate from equity gap.

**Scenario E — Sell-side tax-free crossed**  
UI/tax calendar shows `FREE` state (`calculateTaxStatus`), but **no** proactive sell/reinvest plan engine (**F4.5**, **F3.8**).

---

## Automated audit run (2026-04-30)

| Check | Result |
|--------|--------|
| `node node_modules/prisma/build/index.js validate` | **PASS** — `prisma/schema.prisma` valid |
| `node node_modules/prisma/build/index.js migrate status` | **FAIL** — `P1001` cannot reach `localhost:5432` (PostgreSQL not running on audit host) |
| `node node_modules/typescript/lib/tsc.js -p tsconfig.json --noEmit` | **PASS** |
| `node node_modules/vitest/vitest.mjs run` | **PASS** — 58 tests passed, 24 skipped (API integration suites require `ARTHA_TEST_DB_LIVE=1`) |
| `vitest run --coverage` (threshold files) | **PASS** (exit 0) |
| Docker for ephemeral Postgres | **N/A** — `docker` not available in this shell |

**Conclusion:** Schema and TypeScript are sound; **migration drift and DB-backed behaviour remain unproven** until PostgreSQL is started on **5432** and `migrate status` / `ARTHA_TEST_DB_LIVE=1 npm test` are run locally.

---

## Post-audit remediation (closure pass)

Applied during audit closure so CI/local runs do not false-fail when `DATABASE_URL` is set but Postgres is stopped:

1. **`src/lib/health.ts`** — Probe `SELECT 1` first; on failure return **12** named checks + `trustScore: 0` instead of throwing (**F1.7**).
2. **`tests/api/helpers.ts`** — `hasTestDatabase()` now requires **`ARTHA_TEST_DB_LIVE=1`** in addition to `DATABASE_URL`, so API suites **skip** instead of erroring when the DB is down.
3. **`tests/api/health.test.ts`** — Health suite **always** runs (validates degraded health without DB).
4. **`.github/workflows/ci.yml`** — Sets `ARTHA_TEST_DB_LIVE: '1'` for `npm test` / `test:coverage`.
5. **`.env.example`** — Documents `5432` and `ARTHA_TEST_DB_LIVE`; **`.env`** comment aligned to **5432** (was contradictory).

---

## Appendix A — Source code hot spots

| Area | Files |
|------|--------|
| Planner / adherence | `allocationPlanner.ts`, `adherence.ts`, `planRowUpdate.ts`, `planHistory.ts` |
| Portfolio truth | `portfolio.ts`, `calculations.ts`, `fetchers.ts`, `currency.ts` |
| India lane split | `cfoRoutes.ts` `/api/india/*`, `buildReportData.ts`, **vs** `portfolio.ts` |
| Alerts / cron | `triggers.ts`, `scheduler.ts` |
| AI | `aiIntelligence.ts` |
| Reports | `reportsService.ts`, `reportDocument.ts`, `dashboard/report-template.html` |
| Settings / demo | `dashboard/settings.html`, `demoData` |

---

## Appendix B — Architectural recommendations (for V5 discussion)

1. **Unify money model:** `Decimal` + single FX ledger + single “as-of” timestamp propagated to all aggregates.
2. **Typed plan lines table** instead of JSON array mutation (eliminates race on concurrent PATCH — **not** fully analyzed here).
3. **Single India book** — either fold `IndiaMutualFund` into holdings with country tags or include India MF in `getPortfolioSummary` consistently (**F3.3**).
4. **Sell / rebalance engine** with explicit state machine beyond triggers.
5. **Planner memory** — feed prior plan outcomes and execution deltas into next month generation (**F5.x**).
6. **Alert dedupe + user dismiss** as first-class entities.

---

## Triage — Group 1–5 (for post-audit planning)

| Group | Representative findings |
|-------|---------------------------|
| **G1 — V4 foundation sprint (bugs / small design fixes)** | F3.12 (confidence arg), F9.2 (alert dedupe), F2.4 (RBI hardcode labeling or fetch), F11.2 incomplete buttons, logging on AI errors (**F10.2**), `/api/health` vs `/healthz` alias (**F7.5**); **done:** F1.7 health probe + API test gating (**closure pass**) |
| **G2 — V5 architecture** | F1.5 dual FX, F1.2/F1.4 JSON plan blobs, F4.5 sell engine, F5.1 planner memory, F3.3 India/net worth split |
| **G3 — V5 features** | CSV import, Telegram test, NAV frequency settings, report token expiry, theme auto, metrics endpoint |
| **G4 — Wisdom layer** | Outcome tracking for `RecommendationOutcome`, reinforcement from `AIMemory`, backtests |
| **G5 — Out of scope / accept** | Single-user assumption (**F10.4**), “not tax advice” disclaimers where legally required, full legal tax engine for India/CZ |

---

**Document owner:** Cursor deep audit (static + CLI verification 2026-04-30). **Re-run** sections marked **UNVERIFIED** on a running instance with Postgres (`ARTHA_TEST_DB_LIVE=1 npm test`), browser, and PDF export for full closure.
