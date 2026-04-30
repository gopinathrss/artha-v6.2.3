# Changelog — ARTHA V4

All notable changes across the four sprints (foundation → personal CFO → premium reporting/India/Telegram → production layer).

## 4.0.0 — Production (Sprint 4)

- **Testing:** Migrated to Vitest, Supertest API integration tests, stress suites, coverage gates on core `lib` modules.
- **CI:** GitHub Actions: Postgres 16, Prisma migrate, typecheck, tests, build, optional Codecov.
- **Deploy:** `deploy/setup.sh` (Ubuntu 24.04+), Caddy, PM2, backup/restore scripts, runbook, `.env.production.example`.
- **Reliability:** `docs/V4_RELIABILITY_REPORT.md` for stress outcomes and sign-off.
- **APIs:** `POST /api/this-month/generate-now` returns **201** on new plan; `POST /api/income` validates `amountCzk` (**400** on non-finite).
- **Allocation:** Skip new library equity buys when CZ fund is **already** past the 3y tax window.

## Earlier sprints (summary)

- **Sprint 1–2:** Schema, portfolio, This Month, allocation planner, library, health checks, settings.
- **Sprint 3:** 10-page CFO report, Telegram digest, ECharts, India FD/MF, premium UX polish.
