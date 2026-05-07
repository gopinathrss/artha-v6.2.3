# PIE V6.1 — Deep system audit

**Date:** 2026-05-06  
**Scope:** Static codebase audit + architecture walk at `C:\Projects\artha-v4` (current tree).  
**Method:** Re-run of V6 methodology (14 tracks); compare to `docs/V6_DEEP_AUDIT.md` (2026-05-03).  
**Constraint:** Findings only — **no code changes** in this phase.

---

## Part I — Methodology

- Ground rules **G1–G9** from the audit brief are applied (severity tags, root-cause tags, file:line evidence).
- Prior audit listed **30 findings** (2 CRITICAL, 6 HIGH, 14 MEDIUM, 8 LOW).
- This pass re-reads the **current** `prisma/schema.prisma`, `secrets.ts`, `integrations/store.ts`, `overview.js`, auth middleware, `health.ts`, `allocationPlanner.ts`, `scheduler.ts`, and related hotspots.
- **Schema delta vs prior V6 audit text:** `AppSettings` in the current tree **does not** define `config` or `secrets` JSON columns (those names appeared in the prior audit’s F1.1/F11.1 evidence). Current `AppSettings` ends at auth hash fields and `customCategories` only (`prisma/schema.prisma` lines 202–243). Integration secrets live on **`IntegrationProvider.secrets`** (`prisma/schema.prisma` lines 245–259).

---

## Part II — Executive summary

| Severity  | Prior count | New findings (V6.1 pass) |
|-----------|------------:|---------------------------:|
| CRITICAL  | 2           | 0                          |
| HIGH      | 6           | 1 (**F10.3** MEMORY_HEALTHY) |
| MEDIUM    | 14          | 2 (**F5.2**, **F6.5**)     |
| LOW       | 8           | 3 (**F1.4**, **F13.4**, **F14.4**) |
| **Total new** | —     | **6**                      |

**No new CRITICAL** beyond the prior baseline.

**Net assessment (honest):** At-rest encryption for **IntegrationProvider** secrets is implemented in code (`src/lib/integrations/store.ts` uses `encrypt` from `src/lib/secrets.ts`), and **legacy Settings** secrets use the same envelope when migrated (`getSecret` / `setSecret` in `src/lib/secrets.ts`). That **narrows** the worst-case story of F11.1 versus the prior audit, but **CRITICAL-class exposure remains** wherever plaintext legacy values still sit in `Settings` until re-save, and **F6.1 remains CRITICAL** because `serializeJsonBody` still forces `Decimal.toNumber()` at the API boundary (`src/lib/money.ts` lines 28–36). NAV **health** logic now blends `NavHistory` age and `navLastFetchedAt` (`src/lib/health.ts` lines 85–126), which **partially addresses** the spirit of old F2.1 for the health card — but **`computeHoldingsPriceAgeHours`** still uses `holding.updatedAt` only (`src/lib/calculations.ts` lines 664–678), so confidence scoring can still diverge from “true NAV age.” Dual-write for plans is **confirmed** inside a single `$transaction` (`src/lib/allocationPlanner.ts` lines 433–501). Outcome evaluation cron **is** registered (`src/lib/scheduler.ts` lines 267–280), improving traceability vs the prior **SUSPECTED** F5.1. The reported “dashboard shows nothing while `/api/overview` works” symptom is **not reproduced** in static analysis: `overview.js` requests `/api/overview` and gates on `success` + `data` (lines 88–115). Plausible live causes are **401** when dashboard auth is on without session cookies, **`PIE_EXTERNAL_API_KEY`** gating cross-origin clients without a key (`src/api/externalReadApiGate.ts` lines 11–42), or a **runtime JS error** after partial render — **verify in browser** (Part V).

---

## Part III — Prior findings status (index)

| ID   | Prior severity | V6.1 status   | Note |
|------|----------------|---------------|------|
| F1.1 | MEDIUM         | STILL OPEN    | Json blobs still largely schema-unenforced at DB |
| F1.2 | MEDIUM         | STILL OPEN    | `num()` still `toNumber()` |
| F1.3 | LOW            | SUSPECTED     | Migration drift — verify on deploy DB |
| F2.1 | HIGH           | STILL OPEN    | Health path improved; confidence path still `updatedAt` |
| F2.2 | MEDIUM         | STILL OPEN    | Library refresh cadence vs FX still asymmetric |
| F3.1 | MEDIUM         | STILL OPEN    | `inflowWeightedGainPct` zero on `inv<=0` |
| F3.2 | HIGH           | STILL OPEN    | Waterfall `Contributions` unchanged |
| F3.3 | HIGH           | STILL OPEN    | 1095 ms still used |
| F3.4 | LOW            | STILL OPEN    | MoM sparse snapshot behaviour |
| F4.1 | HIGH           | STILL OPEN    | Sell modules still specialised only |
| F4.2 | MEDIUM         | STILL OPEN    | Continuity narrative unchanged |
| F5.1 | MEDIUM         | CLOSED        | Outcome cron registered in `scheduler.ts` |
| F6.1 | CRITICAL       | STILL OPEN    | `serializeJsonBody` unchanged |
| F6.2 | HIGH           | STILL OPEN    | Allocation tiles still CZK-centric |
| F6.3 | LOW            | STILL OPEN    | Dual health events |
| F6.4 | LOW            | SUSPECTED     | Duplicate file risk not re-grep’d exhaustively |
| F7.1 | MEDIUM         | STILL OPEN    | No leader lock in scheduler |
| F7.2 | LOW            | STILL OPEN    | `/healthz` uses `realPrisma` only |
| F8.1 | MEDIUM         | SUSPECTED     | PDF parity not executed |
| F8.2 | LOW            | STILL OPEN    | Template vs AI labelling |
| F9.1 | MEDIUM         | STILL OPEN    | Dedup now documented; edge paths not load-tested |
| F10.1| MEDIUM         | STILL OPEN    | Validation depth varies by route |
| F10.2| MEDIUM         | STILL OPEN    | `generate-now` still check-then-create |
| F11.1| CRITICAL       | MODIFIED      | Encryption paths exist; plaintext legacy + DB leak story remains |
| F11.2| LOW            | STILL OPEN    | Settings surface breadth |
| F12.1| MEDIUM         | PARTIAL       | Prune + merged retention confirmed in code |
| F12.2| LOW            | STILL OPEN    | Preview volume / UI visibility |
| F13.1| MEDIUM         | STILL OPEN    | UX mismatch lifetime vs SIP |
| F13.2| MEDIUM         | STILL OPEN    | Legacy duplicate cashflows |
| F13.3| LOW            | STILL OPEN    | External API env documentation |
| F14.1| HIGH           | STILL OPEN    | DB-down stubs still WARN-heavy |
| F14.2| LOW            | STILL OPEN    | `console.log` scheduler |
| F14.3| LOW            | STILL OPEN    | `/api/cron/recent` discoverability |

---

## Part IV — Findings by track (full format)

### Track 1 — Data integrity & schema

#### F1.1 [MEDIUM] [ARCHITECTURE]

**Severity:** MEDIUM · **Track:** 1 · **Status:** STILL OPEN  
**Prior finding:** F1.1 STILL OPEN  
**Evidence:** `prisma/schema.prisma` — `Json` on `AlertLog.dataSnapshot` (line 128), `MonthlyLetter.portfolioSnapshot` (line 144), `AllocationPlan.allocations` / `continuity` / `userOverride` (lines 448–451), `AppSettings.customCategories` (line 231), `IntegrationProvider.config` / `secrets` (lines 250–251), `AIMemory.portfolioSnapshot` / `keyNumbers` / `recommendations` (lines 329–332), `AdvisorJournal.metadata` (line 643), `GeneratedReport.dataSnapshot` (line 709), `BacktestRun.configJson` / `resultJson` (lines 694–695), `CronExecution.errors` / `metadata` (lines 630–631), `SystemHealth.metadata` (line 615), `RecommendationOutcome` — none (relational).  
**Reproduction:** Static schema read.  
**Impact:** Invalid shapes surface at runtime on read/write.  
**Recommended fix:** Extend strict parsers at every write boundary; long-term normalize high-value blobs to relational models.

---

#### F1.2 [MEDIUM] [DATA]

**Severity:** MEDIUM · **Track:** 1 · **Status:** STILL OPEN  
**Prior finding:** F1.2 STILL OPEN  
**Evidence:** `src/lib/money.ts` lines 21–24 — `num()` uses `v.toNumber()` for `Prisma.Decimal`.  
**Reproduction:** Static.  
**Impact:** Precision loss for extreme magnitudes in JS math paths.  
**Recommended fix:** Keep Decimal in server math; constrain `num()` to documented safe range or use string serialization at API boundary (pairs with F6.1).

---

#### F1.3 [LOW] [DATA]

**Severity:** LOW · **Track:** 1 · **Status:** SUSPECTED · **Verify with:** `npx prisma migrate status` on each deployment environment.  
**Prior finding:** F1.3 STILL OPEN  
**Evidence:** Prior audit cited historical `DOUBLE PRECISION` migrations; not re-executed here.  
**Reproduction:** DB not available in this pass.  
**Impact:** Skipped migrations could leave legacy float columns in some environments.  
**Recommended fix:** Automated migration drift check in CI or startup guard.

---

#### F1.4 [LOW] [ARCHITECTURE]

**Severity:** LOW · **Track:** 1 · **Status:** OPEN · **NEW**  
**Prior finding:** NEW  
**Evidence:** Prior V6 audit text referenced `AppSettings.config` / `AppSettings.secrets` as `Json`; **current** `AppSettings` model (`prisma/schema.prisma` lines 202–243) has **no** such fields — secrets moved to `IntegrationProvider.secrets`.  
**Reproduction:** Diff prior audit vs current `schema.prisma`.  
**Impact:** Operators following old docs may look for the wrong columns.  
**Recommended fix:** Update any remaining internal docs / runbooks to match current schema.

---

### Track 2 — Ingestion & freshness

#### F2.1 [HIGH] [LOGIC]

**Severity:** HIGH · **Track:** 2 · **Status:** STILL OPEN (narrowed)  
**Prior finding:** F2.1 STILL OPEN  
**Evidence (confidence path):** `src/lib/calculations.ts` lines 664–678 — `computeHoldingsPriceAgeHours` uses `updatedAt` of ACTIVE holdings only.  
**Evidence (health path improved vs prior narrative):** `src/lib/health.ts` lines 85–126 — uses `navLastFetchedAt` for tracked sources and `NavHistory` age for messaging/thresholds.  
**Reproduction:** Static.  
**Impact:** Health card can show fresher semantics than **confidence** inputs driven by `computeHoldingsPriceAgeHours` (`src/lib/portfolio.ts` lines 97–102).  
**Recommended fix:** Reuse the same staleness metric for health, confidence, and planner hints.

---

#### F2.2 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 2 · **Status:** STILL OPEN  
**Prior finding:** F2.2 STILL OPEN  
**Evidence:** `src/lib/scheduler.ts` lines 249–264 — library scores refresh monthly; FX jobs elsewhere (e.g. lines 13–26).  
**Reproduction:** Static.  
**Impact:** TER/returns used in scoring can be older than FX.  
**Recommended fix:** Surface “as of” in UI; align cadence or document.

---

### Track 3 — Calculation correctness

#### F3.1 [MEDIUM] [LOGIC]

**Severity:** MEDIUM · **Track:** 3 · **Status:** STILL OPEN  
**Prior finding:** F3.1 STILL OPEN  
**Evidence:** `src/lib/calculations.ts` lines 420–421 — `inflowWeightedGainPct = inv.lte(0) ? d(0) : …`.  
**Reproduction:** Static.  
**Impact:** Bad cashflow data yields 0% gain rather than an error state.  
**Recommended fix:** Return explicit null / `displayState` for invalid denominator.

---

#### F3.2 [HIGH] [LOGIC]

**Severity:** HIGH · **Track:** 3 · **Status:** STILL OPEN  
**Prior finding:** F3.2 STILL OPEN  
**Evidence:** `src/lib/reports/buildReportData.ts` lines 188–199 — `contrib = max(0, inv - startNw)` where `startNw` is first snapshot trajectory point (`traj[0][1]`, line 188) and `inv` is `totalInvested` from cashflows (line 190).  
**Reproduction:** Static review; compare to user’s mental model of “contributions.”  
**Impact:** Waterfall “Contributions” can mislead.  
**Recommended fix:** Redefine basis (period net investment vs MoM delta) or remove row until defined.

---

#### F3.3 [HIGH] [DATA]

**Severity:** HIGH · **Track:** 3 · **Status:** STILL OPEN  
**Prior finding:** F3.3 STILL OPEN  
**Evidence:** `src/lib/import/excelImport.ts` line 188 — `taxFreeDate = purchaseStartDate + 1095 * 86400000`; `src/lib/sellEngine/taxFreeExit.ts` line 5 — `CZECH_TAX_FREE_DAYS = 1095`.  
**Reproduction:** Static.  
**Impact:** Calendar edge cases vs statutory “three years.”  
**Recommended fix:** Calendar-year rule engine + tests (e.g. Feb 29).

---

#### F3.4 [LOW] [LOGIC]

**Severity:** LOW · **Track:** 3 · **Status:** STILL OPEN  
**Prior finding:** F3.4 STILL OPEN  
**Evidence:** `src/lib/momChange.ts` lines 21–62 — tier 1 ±10d around 30d; tier 2 requires snapshot ≥20d old; label when none.  
**Reproduction:** Sparse `Snapshot` series.  
**Impact:** MoM label “unavailable” — acceptable but should be documented in UI copy.  
**Recommended fix:** Tooltip already partially in `overview.js` lines 196–199 — extend to all surfaces.

---

### Track 4 — Buy / sell / hold engine

#### F4.1 [HIGH] [ARCHITECTURE]

**Severity:** HIGH · **Track:** 4 · **Status:** STILL OPEN  
**Prior finding:** F4.1 STILL OPEN  
**Evidence:** `src/lib/allocationPlanner.ts` imports sell modules (lines 20–23) — tax-free, rebalance drift, FD maturity, hold reasoning only; no general profit-take module.  
**Reproduction:** Product compare.  
**Impact:** “Full CFO sell-side” expectation gap.  
**Recommended fix:** Roadmap modules or narrow marketing copy.

---

#### F4.2 [MEDIUM] [LOGIC]

**Severity:** MEDIUM · **Track:** 4 · **Status:** STILL OPEN  
**Prior finding:** F4.2 STILL OPEN  
**Evidence:** `src/lib/allocationPlanner.ts` lines 45–84 — `computeContinuityMeta` / `continuityBuyReason`.  
**Reproduction:** Generate consecutive plans.  
**Impact:** Substitution / execution variance weakly modeled.  
**Recommended fix:** Tie `SipExecution` / manual execution into next plan inputs.

---

### Track 5 — Continuity, outcomes, AI memory

#### F5.1 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 5 · **Status:** CLOSED  
**Prior finding:** F5.1 CLOSED  
**Evidence:** `src/lib/scheduler.ts` lines 267–280 — `cron.schedule('0 2 * * *', … runCronJob('outcome-evaluation-daily', … evaluatePendingOutcomes))`.  
**Reproduction:** Static.  
**Impact:** Outcomes can stay stale if job fails — monitor via `CronExecution`.  
**Recommended fix:** Add health sub-check for stale outcome queue age.

---

#### F5.2 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 5 · **Status:** OPEN · **NEW**  
**Prior finding:** NEW  
**Evidence:** `src/lib/aiIntelligence.ts` lines 451–459 — primary path uses `aiRouterAsk` (`src/lib/integrations/ai/router.ts` lines 30–70) reading **IntegrationProvider** via `getProviderDecrypted`. Lines 471–497 — **legacy** Anthropic path uses `envAnthropicApiKey()` only, not `getSecret` (Settings has no separate Anthropic string field in `schema.prisma` lines 168–170).  
**Reproduction:** Disable all AI integrations but set env Anthropic key — legacy path may still run after router throws.  
**Impact:** Operators may think disabling integrations blocks all AI calls; env fallback still applies.  
**Recommended fix:** Document env bootstrap behaviour; optionally gate legacy path behind explicit env `ALLOW_LEGACY_AI=1`.

---

### Track 6 — UI / UX

#### F6.1 [CRITICAL] [DATA]

**Severity:** CRITICAL · **Track:** 6 · **Status:** STILL OPEN  
**Prior finding:** F6.1 STILL OPEN  
**Evidence:** `src/lib/money.ts` lines 28–36 — `serializeJsonBody` uses `JSON.stringify` replacer calling `value.toNumber()` for every `Prisma.Decimal`.  
**Reproduction:** Hit any API returning large `Decimal` fields through global middleware in `src/api/server.ts` (lines 33–37).  
**Impact:** Theoretical precision loss at JSON boundary for extreme values; pairs with F1.2.  
**Recommended fix:** Monetary fields as strings in API v2 or bounded `toFixed` policy.

---

#### F6.2 [HIGH] [UI]

**Severity:** HIGH · **Track:** 6 · **Status:** STILL OPEN  
**Prior finding:** F6.2 STILL OPEN  
**Evidence:** `src/dashboard/scripts/overview.js` lines 164–170 — `formatNetWorthDisplay` drives `hero-networth` / `hero-eur` only; `renderAllocation` (lines 239–300) uses percentage labels only (no CCY conversion). Lines 232–236 — stat tiles hard-code `Kč`.  
**Reproduction:** Change hero CCY selector; allocation % unchanged but currency tiles stay CZK.  
**Impact:** Users may believe global CCY switch applies everywhere.  
**Recommended fix:** Label scope or convert tiles.

---

#### F6.3 [LOW] [UI]

**Severity:** LOW · **Track:** 6 · **Status:** STILL OPEN  
**Prior finding:** F6.3 STILL OPEN  
**Evidence:** `src/dashboard/scripts/overview.js` lines 122–123 — dispatches both `pie-health` and `artha-health`.  
**Reproduction:** Grep.  
**Impact:** Maintenance noise.  
**Recommended fix:** Single event namespace.

---

#### F6.4 [LOW] [UI]

**Severity:** LOW · **Track:** 6 · **Status:** SUSPECTED  
**Prior finding:** F6.4 STILL OPEN  
**Verify with:** Workspace-wide search for duplicate `overview.js` paths outside `src/dashboard/scripts`.  
**Evidence:** Not exhaustively re-grep’d in this pass.  
**Impact:** Wrong file edited in some IDE setups.  
**Recommended fix:** Single canonical path + CI duplicate check.

---

#### F6.5 [MEDIUM] [UI]

**Severity:** MEDIUM · **Track:** 6 · **Status:** SUSPECTED · **Verify with:** Browser DevTools on `/` with **dashboard auth on/off**; Network tab for `/api/overview` status; Console for uncaught exceptions.  
**Prior finding:** NEW (FOCUS-3)  
**Evidence:** `src/dashboard/scripts/overview.js` lines 88–115 — `fetch('/api/overview').then(r => r.json())`; renders when `ov.success` and `ov.data`. `src/api/dashboardAuthMiddleware.ts` lines 62–70 — when `dashboardAuthEnabled`, `/api/*` returns **401** without `pie_dashboard` cookie — `ov.success` false, `showOverviewError` (lines 107–108). `src/api/externalReadApiGate.ts` lines 23–41 — non–same-origin GET without API key returns **401** for gated paths including `/api/overview` (default list line 3). Required DOM ids exist: `hero-networth` (`index.html` line 364), `alloc-bar-current` (line 428), `health-checks-grid` (line 526).  
**Reproduction:** Cannot confirm “blank with 200 overview” without live trace — static path is consistent.  
**Impact:** If user sees empty chrome without error banner, suspect **different page**, **cached broken bundle**, or **error element hidden by CSS** — needs runtime capture.  
**Recommended fix:** Add defensive null-checks before `innerHTML` assignments in `renderAllocation` (`overview.js` line 253) for resilience if DOM changes.

---

### Track 7 — System flow & lifecycle

#### F7.1 [MEDIUM] [ARCHITECTURE]

**Severity:** MEDIUM · **Track:** 7 · **Status:** STILL OPEN · **SUSPECTED**  
**Prior finding:** F7.1 STILL OPEN  
**Evidence:** `src/lib/scheduler.ts` — many `cron.schedule` entries; no file lock / advisory lock in file.  
**Reproduction:** Run two Node processes.  
**Impact:** Duplicate cron effects.  
**Recommended fix:** Single-instance orchestration or DB advisory lock per job.

---

#### F7.2 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 7 · **Status:** STILL OPEN  
**Prior finding:** F7.2 STILL OPEN  
**Evidence:** `src/api/server.ts` lines 154–178 — `/healthz` uses `realPrisma` only.  
**Reproduction:** Demo mode on secondary DB.  
**Impact:** Demo DB health not reflected.  
**Recommended fix:** Optional demo probe query param.

---

#### F7.3 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 7 · **Status:** OPEN · **NEW** (inventory)  
**Prior finding:** NEW  
**Evidence:** `src/lib/scheduler.ts` — jobs include: `fx-refresh-weekday` (lines 14–26), `morning-job-weekday` (28–41), `monthly-letter` (43–60), `weekly-backup` (62–74), `eom-journal` (76–105), `salary-auto-plan` (107–168), `daily-digest` (170–198), `amfi-navall-ingest` (200–219), `nav-refresh-czech` (221–247), `library-scores-monthly` (249–264), `outcome-evaluation-daily` (267–280), `email-ingestion` (283–293), `historical-nav-refresh-quarterly` (295–311), `monthly-report-smart` (313–324), `quarterly-report-smart` (327–338), `tax-year-report-smart` (341–352), `prune-old-rows` (355–380). Each wrapped in `runCronJob` → `CronExecution` (`src/lib/cronWrapper.ts` lines 7–56) except the placeholder bootstrap `void` block (lines 383–391).  
**Reproduction:** Static.  
**Impact:** **Positive** — answers audit questions on registration.  
**Recommended fix:** Publish this table in operator docs.

---

### Track 8 — Reporting & PDF/HTML

#### F8.1 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 8 · **Status:** SUSPECTED  
**Prior finding:** F8.1 STILL OPEN  
**Evidence:** Templates under `src/lib/reports/` not executed in browser here.  
**Reproduction:** Playwright PDF or manual print.  
**Impact:** Print layout risk.  
**Recommended fix:** Automated PDF snapshot tests.

---

#### F8.2 [LOW] [UI]

**Severity:** LOW · **Track:** 8 · **Status:** STILL OPEN  
**Prior finding:** F8.2 STILL OPEN  
**Evidence:** `src/lib/reports/templates/` — mixed static and computed narrative (not re-read every file).  
**Reproduction:** Static sampling.  
**Impact:** Generic-looking “AI” sections.  
**Recommended fix:** Label provenance in report header.

---

### Track 9 — Alerts & dedup

#### F9.1 [MEDIUM] [INTEGRATION]

**Severity:** MEDIUM · **Track:** 9 · **Status:** STILL OPEN · **partially clarified**  
**Prior finding:** F9.1 STILL OPEN  
**Evidence:** `src/lib/alerts/dedup.ts` lines 10–74 — `DISMISS_RETENTION_MS = 30 * 86400000` documented; `fireAlertWithDedup` updates ACTIVE vs DISMISSED within window. Pruning: `src/lib/cron/pruneOldRows.ts` lines 47–52 — dismissed alerts older than merged retention.  
**Reproduction:** Integration test not run.  
**Impact:** Unknown edge paths for new `triggerType` values.  
**Recommended fix:** Unit tests per trigger type keying (`alertKeyForTrigger`, lines 12–18).

---

### Track 10 — Stability & failure modes

#### F10.1 [MEDIUM] [ARCHITECTURE]

**Severity:** MEDIUM · **Track:** 10 · **Status:** STILL OPEN  
**Prior finding:** F10.1 STILL OPEN  
**Evidence:** `src/api/server.ts` lines 33–37 — global `res.json` wrapper; per-route validation still ad hoc (spot-check: `integrationsRoutes` uses cast bodies, `cfoRoutes` varies).  
**Reproduction:** Fuzz POST bodies — not run.  
**Impact:** Inconsistent 400 vs 500.  
**Recommended fix:** Zod per route group.

---

#### F10.2 [MEDIUM] [DATA]

**Severity:** MEDIUM · **Track:** 10 · **Status:** STILL OPEN · **SUSPECTED**  
**Prior finding:** F10.2 STILL OPEN  
**Evidence:** `src/api/cfoRoutes.ts` lines 475–497 — `findFirst` for existing plan then `generateMonthlyPlan`; no serializable transaction / unique constraint on `(monthYear)` alone (`prisma/schema.prisma` lines 439–457 shows `@@index([monthYear, status])` only, line 457).  
**Reproduction:** Parallel POSTs.  
**Impact:** Rare duplicate plans.  
**Recommended fix:** Unique partial index or transaction with `SELECT … FOR UPDATE`.

---

#### F10.3 [HIGH] [OBSERVABILITY]

**Severity:** HIGH · **Track:** 10 · **Status:** OPEN · **NEW** (operational)  
**Prior finding:** NEW (FOCUS-10)  
**Evidence:** `src/lib/health.ts` lines 378–386 — `MEMORY_HEALTHY`: `ratio = heapUsed / heapTotal`; **FAIL** if `ratio >= 0.9` (lines 381–385). Message includes percent. High heap ratio can be **normal** for Node after warm-up or a single large request — not necessarily a leak.  
**Reproduction:** Observe `/api/health` on busy instance.  
**Impact:** Operators may chase false positives or miss true OOM risk; no RSS / GC pause metrics.  
**Recommended fix:** Track RSS trend, add baseline guidance, or use WARN unless sustained above threshold N minutes.

---

### Track 11 — Settings, secrets, onboarding

#### F11.1 [CRITICAL] [SECURITY]

**Severity:** CRITICAL · **Track:** 11 · **Status:** MODIFIED (partially mitigated) — treat as **STILL OPEN** for compliance story until all legacy rows encrypted  
**Prior finding:** F11.1 MODIFIED  
**Evidence:** `prisma/schema.prisma` lines 165–196 — `Settings.smtpPass`, `imapPassword`, `openaiApiKey`, `telegramBotToken` remain plain `String?` columns (DB type not encrypted by Postgres itself). `src/lib/secrets.ts` lines 109–147 — `getSecret` / `setSecret` enforce `enc:v1:` envelope; plaintext throws `PlaintextSecretError` (lines 127–128). `src/lib/integrations/store.ts` lines 95–106 — new secret values encrypted with `encrypt()` before persist; `decryptSecretsJson` lines 31–33 rejects non-envelope strings.  
**Reproduction:** `SELECT` Settings row — may show `enc:v1:` blobs or legacy plaintext until re-save.  
**Impact:** DB dump still sensitive; plaintext legacy is CRITICAL until migrated.  
**Recommended fix:** One-time migration job to encrypt all legacy fields; monitor `SystemHealth` `PlaintextSecretError` logs.

---

#### F11.2 [LOW] [UI]

**Severity:** LOW · **Track:** 11 · **Status:** STILL OPEN  
**Prior finding:** F11.2 STILL OPEN  
**Evidence:** `src/dashboard/scripts/settings.js` — large surface (not line-audited line-by-line in this pass).  
**Reproduction:** Manual QA.  
**Impact:** Possible dead toggles.  
**Recommended fix:** Feature flags or hide unfinished controls.

---

### Track 12 — Retention & data lifecycle

#### F12.1 [MEDIUM] [OBSERVABILITY]

**Severity:** MEDIUM · **Track:** 12 · **Status:** PARTIAL CLOSURE  
**Prior finding:** F12.1 improved  
**Evidence:** `src/lib/cron/pruneOldRows.ts` lines 21–52 — reads retention from `getMergedSettings` (`src/lib/appSettingsMerge.ts`). `src/lib/scheduler.ts` lines 355–380 — weekly `prune-old-rows`. `src/lib/health.ts` lines 391–409 — `RETENTION_POLICY` check references last successful prune.  
**Reproduction:** Static.  
**Impact:** Operator can see prune health; table growth still possible if job fails silently (check `CronExecution`).  
**Recommended fix:** Alert on repeated prune FAILURE rows.

---

#### F12.2 [LOW] [ARCHITECTURE]

**Severity:** LOW · **Track:** 12 · **Status:** STILL OPEN  
**Prior finding:** F12.2 STILL OPEN  
**Evidence:** `prisma/schema.prisma` lines 274–295 — `EmailIngestionPreview`; prune exempts `PENDING` (`pruneOldRows.ts` lines 41–45).  
**Reproduction:** Heavy IMAP.  
**Impact:** PENDING backlog could grow.  
**Recommended fix:** Dashboard card for oldest PENDING age.

---

### Track 13 — V6-specific (auth, gates, portfolio semantics)

#### F13.1 [MEDIUM] [UI]

**Severity:** MEDIUM · **Track:** 13 · **Status:** STILL OPEN  
**Prior finding:** F13.1 STILL OPEN  
**Evidence:** Not re-opened `portfolio.js` in this pass; issue retained from prior audit.  
**Reproduction:** Compare “lifetime contributed” vs SIP column.  
**Impact:** User trust.  
**Recommended fix:** Inline help / column rename.

---

#### F13.2 [MEDIUM] [DATA]

**Severity:** MEDIUM · **Track:** 13 · **Status:** STILL OPEN  
**Prior finding:** F13.2 STILL OPEN  
**Evidence:** `src/lib/import/excelImport.ts` lines 229–235 — `deleteMany` only for `notes: 'Imported from Banking_Input.xlsx'` before re-import.  
**Reproduction:** Legacy duplicates with different notes remain.  
**Impact:** Inflated totals until cleanup script.  
**Recommended fix:** Guarded “reset banking import cashflows” action.

---

#### F13.3 [LOW] [INTEGRATION]

**Severity:** LOW · **Track:** 13 · **Status:** STILL OPEN  
**Prior finding:** F13.3 STILL OPEN  
**Evidence:** `src/api/externalReadApiGate.ts` lines 45–60 — env-configured paths and keys.  
**Reproduction:** Read env docs in comment lines 45–51.  
**Impact:** Misconfiguration exposes read APIs.  
**Recommended fix:** Operator runbook section.

---

#### F13.4 [LOW] [SECURITY]

**Severity:** LOW · **Track:** 13 · **Status:** OPEN · **NEW**  
**Prior finding:** NEW (FOCUS-8)  
**Evidence:** `src/api/dashboardAuthMiddleware.ts` lines 36–37 — when `!isDashboardAuthEnabled()` middleware **returns `next()` immediately** — no redirect, no API block. `src/lib/dashboardAuth.ts` lines 16–19 — `PIE_DASHBOARD_AUTH=0` forces off. Session cookie: `src/lib/dashboardAuth.ts` lines 84–89 — `HttpOnly; SameSite=Lax; Secure` in production.  
**Reproduction:** Static.  
**Impact:** **Clarifies** blank dashboard is **not** explained by auth middleware when auth is default-false; look to **401** when auth enabled, or external gate, or JS errors.  
**Recommended fix:** None for middleware; improve client error surfacing for 401 JSON.

---

### Track 14 — Observability & ops

#### F14.1 [HIGH] [OBSERVABILITY]

**Severity:** HIGH · **Track:** 14 · **Status:** STILL OPEN  
**Prior finding:** F14.1 STILL OPEN  
**Evidence:** `src/lib/health.ts` lines 15–43 — `healthChecksWhenDbDown` sets non-DB checks to **WARN** “Skipped — database unavailable.”  
**Reproduction:** Stop Postgres; `GET /api/health`.  
**Impact:** Trust score can stay non-zero while DB dead.  
**Recommended fix:** Overall `status: DOWN` field; force trust 0 or separate `dataHealth` flag.

---

#### F14.2 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 14 · **Status:** STILL OPEN  
**Prior finding:** F14.2 STILL OPEN  
**Evidence:** `src/lib/scheduler.ts` — e.g. lines 18–22, 31–36, etc. — `console.log` / `console.error`.  
**Reproduction:** Grep `[Scheduler]`.  
**Impact:** Non-structured logs.  
**Recommended fix:** JSON logger with `job`, `durationMs`, `error`.

---

#### F14.3 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 14 · **Status:** STILL OPEN  
**Prior finding:** F14.3 STILL OPEN  
**Evidence:** `src/api/cfoRoutes.ts` line 940 — `app.get('/api/cron/recent', …)`.  
**Reproduction:** Hit endpoint on running server.  
**Impact:** Low if undiscovered.  
**Recommended fix:** Link from Settings diagnostics card.

---

#### F14.4 [LOW] [OBSERVABILITY]

**Severity:** LOW · **Track:** 14 · **Status:** OPEN · **NEW** (documentation)  
**Prior finding:** NEW  
**Evidence:** `src/lib/health.ts` lines 415–417 — `trustPct = min(100, round((pass*100 + warn*50) / HEALTH_CHECK_COUNT))` with `HEALTH_CHECK_COUNT = 17` (line 13).  
**Reproduction:** Static.  
**Impact:** Operators may not understand weighting.  
**Recommended fix:** Document formula next to trust score in Settings UI.

---

## Part V — Suspected items (need running instance)

| ID | Item | How to verify |
|----|------|----------------|
| S1 | Duplicate cron under multi-process | Two `node dist/api/server.js` + inspect `CronExecution` duplicates / double emails |
| S2 | Parallel `generate-now` duplicate plans | `ab`/`hey` concurrent POST `/api/this-month/generate-now` |
| S3 | “Blank dashboard” with 200 overview | Browser: Network + Console on `/`; check 401 on any of the five parallel fetches; verify `Sec-Fetch-Site` vs external API gate |
| S4 | PDF report layout | Playwright print/PDF |
| S5 | Plaintext secrets remaining | SQL: `SELECT openaiApiKey, smtpPass FROM "Settings" LIMIT 1` — confirm `enc:v1:` prefix |
| S6 | F1.3 migration drift | `prisma migrate status` on prod |

---

## Part VI — Verified working (this pass)

- **`IntegrationProvider.secrets`** encrypted on write via `encrypt` in `src/lib/integrations/store.ts` lines 95–106; decrypted via `decryptSecretsJson` lines 23–36.  
- **`registerIntegrationsRoutes`** mounted from `src/api/server.ts` (grep `registerIntegrationsRoutes(app)`).  
- **`aiRouterAsk`** reads enabled integration + decrypted key (`src/lib/integrations/ai/router.ts` lines 36–41).  
- **Dual-write plans** in one transaction: `src/lib/allocationPlanner.ts` lines 433–501 with `replacePlanRows` at line 476.  
- **Outcome evaluation cron** registered: `src/lib/scheduler.ts` lines 267–280.  
- **Prune job** registered: `src/lib/scheduler.ts` lines 355–380; logic in `src/lib/cron/pruneOldRows.ts`.  
- **Banking import** deletes prior tagged cashflows: `src/lib/import/excelImport.ts` lines 229–235.  
- **Plan dual-write atomicity:** `src/lib/allocationPlanner.ts` lines 433–501 — one `$transaction` creates plan, updates JSON `allocations`, calls `replacePlanRows` (line 476), inserts `RecommendationOutcome` rows.  
- **Integration test HTTP route:** `src/api/integrationsRoutes.ts` lines 111–127 — `POST /api/integrations/:key/test` → `runIntegrationProviderTest` (rate-limited lines 28–39).  
- **Overview DOM wiring** present: `index.html` + `overview.js` `loadOverview` (lines 88–115).  
- **Dashboard auth off by default** does not block: `src/api/dashboardAuthMiddleware.ts` lines 36–37, 63–64.  
- **Session cookie** flags: `src/lib/dashboardAuth.ts` lines 84–89 — HttpOnly, SameSite=Lax, Secure in production.

---

## Part VII — Scenario matrix

| Scenario | Prior status | V6.1 status | Notes |
|---------|--------------|-------------|-------|
| A — First-time user lifecycle | NOT RUN | NOT RUN | Needs DB + browser |
| B — Stale FX | NOT RUN | NOT RUN | Needs time manipulation |
| C — Execution vs plan conflict | NOT RUN | NOT RUN | — |
| D — Multi-currency overnight | NOT RUN | NOT RUN | — |
| E — Post tax-free sell UX | NOT RUN | NOT RUN | — |

---

## Part VIII — Recommended V6.2 hardening plan

| Sprint theme | Closes / mitigates | Complexity |
|--------------|-------------------|------------|
| **Money at boundary** | F6.1, F1.2 | L–XL |
| **Secrets & legacy plaintext** | F11.1 | M–L |
| **Reporting & calc honesty** | F3.2, F3.3 | M |
| **Ops truthfulness** | F14.1, F10.3, F7.1 | M–L |
| **UI CCY & trust** | F6.2, F14.4, F13.1 | M |

---

## Appendix A — Source hot spots

| File | Risk concentration |
|------|---------------------|
| `src/lib/money.ts` | `serializeJsonBody`, `num`, `d` |
| `src/lib/calculations.ts` | Net worth, allocation, **price age hours**, tax status |
| `src/lib/health.ts` | Trust score, DB-down behaviour, **memory ratio** |
| `src/lib/integrations/store.ts` | Encryption + env bootstrap |
| `src/lib/aiIntelligence.ts` | Router + legacy fallback |
| `src/lib/allocationPlanner.ts` | Transactional plan write |
| `src/lib/reports/buildReportData.ts` | Waterfall |
| `src/api/dashboardAuthMiddleware.ts` | Auth gate |
| `src/api/externalReadApiGate.ts` | External read exposure |

---

## Appendix B — V6.1 delta from V6 audit document

- **Schema:** `AppSettings` no longer includes generic `config`/`secrets` JSON as cited in 2026-05-03 audit text; integration secrets are on **`IntegrationProvider`**.  
- **Encryption:** `integrations/store.ts` + `secrets.ts` provide explicit **AES-256-GCM** envelope for integration secrets and Settings fields when using `setSecret`.  
- **Health:** `NAV_FRESHNESS` check now uses **`navLastFetchedAt`** and `NavHistory` (`health.ts` lines 85–126), not only `updatedAt` (but confidence still uses `updatedAt` via `computeHoldingsPriceAgeHours`).  
- **Outcomes:** Daily cron **present** in `scheduler.ts` — prior F5.1 “not traced” resolved in static read.  
- **Operational:** Explicit **heap ratio** check documents FAIL at ≥90% (`health.ts` lines 378–386).

---

*End of V6.1 deep audit (findings-only phase).*
