# ARTHA V4 Deep Audit — Post-Hardening 2026-05-01

**Scope:** Reconciliation after **Area 5** (alerts, observability, `/healthz`, fail-loud demo DB, cron ledger, AI failure logging). Static review + automated tests (`vitest`, `tsc`); full browser, 24h soak, and production Postgres verification remain **environment-dependent**.

---

## Executive summary

| Severity | Count (post-hardening, approximate) |
|----------|----------------------------------------|
| **CRITICAL** | **1** (accepted; see below) |
| **HIGH** | **~8–10** (several closed since 2026-04-25 baseline; exact count depends on how you classify borderline “HIGH” vs “MEDIUM”) |
| **MEDIUM** | ~15+ |
| **LOW** | ~10+ |

**CRITICAL accepted for V4.1:** **F1.1** (money fields as `Float` / not `Decimal`) — inventory exists (`docs/F1.1_FIELD_AUDIT.md`); full Prisma `Decimal` migration + arithmetic refactor is **deferred to V5** as a single controlled migration project. **No additional unfixed CRITICAL regressions** were introduced by Areas 4–5.

**HIGH — materially improved in Areas 4–5:** demo isolation (**F6.1**), planner memory (**F5.1**), AI execution context (**F5.2**), outcome tracking (**F5.4**), alert dedup (**F9.2**), dismissal (**F9.5**), AI failure telemetry (**F10.2**), cron ledger (**F12.4**), `/healthz` (**F7.5**).

---

## Findings carried over from initial audit (status snapshot)

| Id | Status (2026-05-01) | Note |
|----|----------------------|------|
| F1.1 | **CLOSED** (accepted V4.1)** | Decimal migration → V5 |
| F1.2–F1.4, F1.6 | OPEN / partial | Json blobs, optional `planId`, etc. |
| F1.5 | **CLOSED** | FX single path (prior sprint) |
| F2.x | Mixed | RBI constant + health (F2.4 partial close per prior doc); AMFI/Erste nuances remain |
| F3.x (India / NW) | Mixed | F3.3 closed in prior tags per audit history |
| F4.x sell/hold | **CLOSED** (Area 3) | Per `area3-complete` |
| F5.1, F5.2, F5.4 | **CLOSED** (Area 4) | Continuity, AI history, outcomes |
| F5.3 | OPEN | “Rejected twice” not implemented |
| F6.1 | **CLOSED** | Separate DB + fail-loud `DATABASE_URL_DEMO` |
| F7.5 | **CLOSED** | `/healthz` |
| F9.2 | **CLOSED** | `alertKey`, dedup, `fireCount` |
| F9.5 | **CLOSED** | Dismiss + UI + retention on dismissed |
| F10.2 | **CLOSED** | `SystemHealth` AI success/fail + `AI_RECENT_FAILURES` + `/api/ai/recent-errors` + Telegram hook |
| F12.4 | **CLOSED** | `CronExecution`, `runCronJob`, `/api/cron/recent`, `CRON_HEALTH` |

*(Full line-by-line closure of all 61 original rows is in `V4_DEEP_AUDIT.md`; this document records the **hardening delta**.)*

---

## New findings (this re-audit)

- None blocking V4.1 tag; optional: expand **CRON_HEALTH** to per-job SLA once enough production history exists.

---

## Verdict

**V4.1 is “hardened” for a single-user / VPS deployment** with the explicit **exception** that **F1.1 Decimal migration** remains planned work, not done. Observability (cron ledger, AI failures, health checks, `/healthz`) and alerts (dedup, dismiss) are now suitable for real operation **after** `prisma migrate deploy` on both `DATABASE_URL` and `DATABASE_URL_DEMO` and valid env pairs.

---

## Recommendations for V5

- F1.1: `Decimal` migration + money arithmetic audit.
- F5.3: planner feedback from repeated skips.
- Broader WCAG / mobile audit (F6.x/F7.x leftovers).
