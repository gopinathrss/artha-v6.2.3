# V5.1 Hardening — Area 2 — Truthful Performance Metrics

## Status: COMPLETE (code + tests)

Environment note: this workspace shell did not have `psql`, `git`, or `npx` on `PATH`; **P0.1–P0.3 (DB column / invariant / live curl)** and **Task 0 backups / tags / baselines** were **not executed here**. Re-run those on a machine with Postgres + CLI tools before merging. `tsc` and `vitest` were run via the bundled Node helper and passed.

## Pre-flight checks

| Check | Result |
|--------|--------|
| P0.1 `balanceCzkSnapshot` on `Account` | Not verified (psql unavailable) |
| P0.2 Account invariant 0 rows | Not verified |
| P0.3 Server health + curl overview | Not verified |

## Findings closed (implementation)

| ID | Topic | Notes |
|----|--------|--------|
| F2.3 | XIRR Shape A | `calculateXIRR` → `displayValue` / `displayState` / `rawEstimate`; dropped `value`. Dashboard Overview IRR row + `ⓘ` tooltips. |
| F2.5 | Inflow-weighted gain | `calculateNetWorth` → `inflowWeightedGainCzk` / `inflowWeightedGainPct`. Portfolio hero + demo `netWorth`. |
| F2.4 | MoM window | `momChange.ts`: ±10d tier 1, tier 2 ≥20d; labels `MoM` / `Change vs Nd ago` / unavailable. Duplicate `const now` removed in `portfolio.ts`. |

## API shape changes (breaking)

- **`xirr.value`** removed → use **`displayValue`** (null unless `displayState === 'OK'`).
- Added: `displayLabel`, `displayState`, `rawEstimate`, `monthsOfHistory`, `minMonthsForDisplay`.
- **`netWorth.gainCzk` / `gainPct`** removed from summary → **`inflowWeightedGainCzk` / `inflowWeightedGainPct`**.
- **`momChange.tier`** added (`1` \| `2` \| `null`).

**Unchanged (by design):** Prisma `Snapshot.gainCzk` / `gainPct`, holding-level `gainCzk`/`gainPct` in `demoData` holdings, `RecommendationOutcome.gainPctAt90d`, etc.

## Files modified

| File | Change |
|------|--------|
| `src/lib/calculations.ts` | Shape A XIRR + net worth field names (pre-existing in branch; verified paths). |
| `src/lib/momChange.ts` | `MoneyInput` typing; tier labels per spec. |
| `src/lib/portfolio.ts` | MoM wiring; remove duplicate `now`. |
| `src/lib/demoData.ts` | Demo `netWorth`, `xirr`, `momChange` shapes. |
| `src/dashboard/index.html` | IRR hero stat + info icon. |
| `src/dashboard/scripts/overview.js` | IRR + MoM rendering + titles. |
| `src/dashboard/portfolio.html` | “Gain vs SIP” label + title. |
| `src/dashboard/scripts/portfolio.js` | `inflowWeightedGain*` + tooltip. |
| `tests/unit/calculations.test.ts` | XIRR / net worth expectations (prior edit). |
| `tests/unit/xirr.test.ts` | Full Shape A assertions + cases D–F. |
| `tests/unit/calculations/netWorth.test.ts` | Rename / math smoke. |
| `tests/unit/portfolio/momChange.test.ts` | Tier A–D cases. |
| `tests/stress/multiYear.test.ts` | `xirrNumeric`; net worth zeros; rawEstimate crit. |
| `tests/stress/dataCorrectness.test.ts` | XIRR headline numeric via `displayValue \|\| rawEstimate`. |
| `tests/api/overview-xirr.test.ts` | Integration shape (`describe.skipIf(!hasTestDatabase())`). |
| `docs/METHODOLOGY.md` | XIRR, inflow-weighted gain, MoM tiers. |

## Call sites refactored (from Area 2 scope)

- `src/lib/triggers.ts`, `src/lib/aiIntelligence.ts`, `src/lib/reportDocument.ts`, `src/lib/reports/buildReportData.ts`, `src/lib/telegram/bot.ts` — already aligned in branch; verified `rg xirr.value` → 0.

## Baseline vs post-Area-2

| Field | Baseline | Post-Area-2 |
|-------|----------|----------------|
| `xirr.value` | (varies) | **removed** |
| `xirr.displayValue` | n/a | number or `null` |
| `xirr.displayState` | n/a | `OK` \| `INSUFFICIENT_HISTORY` \| `ESTIMATE_HIDDEN` |
| `netWorth.gainPct` | (varies) | **removed** |
| `netWorth.inflowWeightedGainPct` | n/a | same numeric as old `gainPct` |
| `momChange.label` | long / unavailable | `MoM` / `Change vs Nd ago` / unavailable per tier |

*(Baseline JSON/curl not captured in this environment.)*

## Smoke test evidence

- **G1 / GATE A:** `node …/tsc --noEmit` → exit 0  
- **G2 / GATE B:** `node …/vitest.mjs run` → 99 passed, 26 skipped (DB-gated suites skipped without `ARTHA_TEST_DB_LIVE=1`)

Browser `/overview` and live `curl` were not run in this session.

## Tests added

- `tests/unit/portfolio/momChange.test.ts` — 4 lookup cases + label mapping  
- `tests/unit/calculations/netWorth.test.ts` — field names + 100% math  
- `tests/api/overview-xirr.test.ts` — response shape when DB live  
- Extended `tests/unit/xirr.test.ts` (cases D–F) and stress/unit touch-ups above  

## Risks / known issues

- **P0 not gated:** confirm Area 1 migration on real DB before deploy.  
- **`rg "\.gainPct\b"`** will still match Prisma-backed snapshot fields and unrelated `gainPctAt90d` — intentional; overview **`netWorth`** path is clean.  
- **Case C (ESTIMATE_HIDDEN at 12+ mo)** not isolated in a dedicated synthetic test (solver-dependent); ESTIMATE_HIDDEN is covered by logic in `computeXirrDisplay` + benchmarks in `calculations.test.ts`.

## Recommendations for Area 3

- If any lesson/report template still assumed `xirr.value` or portfolio `gainPct`, re-grep after merge.  
- Run `ARTHA_TEST_DB_LIVE=1` CI job once for `overview-xirr.test.ts`.

## Git / rollback

Git CLI was unavailable in the verification shell: **create commits locally** per sprint rules (`fix(F2.3)`, `fix(F2.5)`, `fix(F2.4)`, `chore(area2): …`), tag `pre-v51-area2` / `v51-area2-complete`, and apply **Task 0** backups on the Postgres host.

Rollback: see sprint rollback section (`git reset`, `pg_restore` from `backups/pre-v51-area2*.sql`).
