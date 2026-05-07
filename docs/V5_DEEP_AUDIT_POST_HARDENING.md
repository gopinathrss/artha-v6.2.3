# ARTHA V5.1 Post-Hardening Audit

**Date:** 2026-05-01  
**Auditor:** Cursor (autonomous implementation pass)  
**Base audit:** `docs/V5_DEEP_AUDIT.md` (2026-05-02, 27 findings)  
**Hardening scope:** V5.1 Areas 1–4 (tags `v51-area1-complete` … `v51-area4-complete` / `v5.1-hardened` as applied on your machine)

## Executive summary

| Phase | CRITICAL | HIGH | MEDIUM | LOW |
|-------|----------|------|--------|-----|
| Pre (baseline doc) | 0 | 7 | 14 | 6 |
| Post (target) | 0 | **0** | **≤8 open** | LOW unchanged or documented |

**Closed in Area 4 (this pass):** F10.1 (AES secrets), F11.1 (TTL prune), F11.2 (alert dedup docs + dismissed purge), F6.1 (SystemHealth bootstrap), F6.2 (cron `SCHEDULED` placeholders), F8.1 (NAV Erste-only WARN), F4.1 (outcome PENDING UX + API fields), Area 3 stretch (typed plan reads via `readPlanAllocationsOrEmpty` / mutation parse), F9.1/F9.2 (documented checklist `tests/smoke/faultInjection.md`), F12.2 (determinism test with live DB), F8.2 (health check count **17** including `RETENTION_POLICY`).

**Remaining for V5.2 (examples):** F4.2, F5.1, F7.1, F10.2, F12.1 — unchanged from baseline unless you re-run those suites manually.

## Findings tracking (abbreviated)

| F# | Severity | Status | Closed in | Notes |
|----|----------|--------|-----------|--------|
| F1.1 | HIGH | CLOSED | Area 3 | AllocationPlanRow + Zod-style validators |
| F2.1–F2.3, F3.1–F3.3 | HIGH/MED | CLOSED | Areas 1–3 | Per prior sprint docs |
| F3.2 | HIGH | CLOSED | Area 3 | Lesson regen path |
| F10.1 | HIGH | CLOSED | Area 4 | `src/lib/secrets.ts` |
| F4.1 | MEDIUM | CLOSED | Area 4 | Outcomes summary + reports UI |
| F6.1 | MEDIUM | CLOSED | Area 4 | `bootstrapSystemHealth` |
| F6.2 | MEDIUM | CLOSED | Area 4 | `ensureCronJobPlaceholders` |
| F8.1 | MEDIUM | CLOSED | Area 4 | Erste-only NAV WARN |
| F8.2 | LOW | CLOSED | Area 4 | Count 17; update any “14+” strings |
| F9.1–F9.2 | MEDIUM | DOCUMENTED | Area 4 | Smoke template, not CI-blocked |
| F11.1 | MEDIUM | CLOSED | Area 4 | `pruneOldRows` + Settings retention |
| F11.2 | MEDIUM | CLOSED | Area 4 | Dedup comment + AlertLog prune + UI |
| F12.2 | MEDIUM | CLOSED | Area 4 | `tests/unit/backtest/determinism.test.ts` |
| F12.3 | LOW | CLOSED | Area 3 | monthYear guard |

## Verdict

V5.1 is **materially hardened** for single-user production: money columns on `Decimal`, plan integrity (rows + JSON + guards), secrets encryption with plaintext fail-closed, retention pruning, and clearer health/outcomes UX. **Run** `npx prisma migrate deploy`, `npm run migrate:secrets` once on existing DBs, `ARTHA_TEST_DB_LIVE=1 npx vitest run`, and fill `tests/smoke/faultInjection.md` before declaring production sign-off.

**Top V5.2 items:** F10.2 demo stress, F5.1 Playwright visual pass, F4.2 AI debug logging test, optional read-path hardening if any `plan.allocations` casts remain outside `src/lib`.
