# ARTHA V4 — Reliability report (Sprint 4)

**Reliability score (spec formula):** $(P \times 100 + W \times 75) / T$ with `P` = passed, `W` = warned, `T` = total from stress + critical suites. After `npm test` and `npm run test:stress`, update the counts below in CI or locally.

| Run | T | P | W | F | Score (approx.) |
|-----|---|---|---|---|---|
| Last local `npm test` + `npm run test:stress` (same Vitest run includes `tests/stress/*`) | 82 | 82 | 0 | 0 | **100** |

**Stress files**

| File | Purpose |
|------|---------|
| `tests/stress/dataCorrectness.test.ts` | XIRR, allocation, India LTCG math, fee delta |
| `tests/stress/loadTest.test.ts` | Hot loops: XIRR and mocked monthly plans |
| `tests/stress/failureInjection.test.ts` | `markPlanRowDone` and prisma failure paths |

**Interpreting the score (from sprint spec)**

- **≥ 80** — hostable
- **60–80** — hostable with caveats
- **< 60** — fix blockers first

**Failure modes to watch (severity)**

| Area | Symptom | Mitigation |
|------|-----------|------------|
| DB connectivity | 500s on all routes | `DATABASE_URL`, firewall, Postgres service |
| FX / CNB | Stale or missing CZK/INR | CNB+ECB fallbacks, manual refresh, cron `ensureFreshRates` |
| AI keys | "Set API key" memories from `/intelligence/ask` | `ANTHROPIC_API_KEY` or OpenAI in settings |
| Caddy / TLS | 502/525 from browser | DNS, Caddyfile, port 3002, PM2 up |

**Recommended follow-ups (impact)**

1. Hit **≥ 65% branch** coverage on critical `lib` files (see `vitest.config.ts` thresholds and comments).
2. Add full HTTP **load** tests on `/api/this-month` and `/api/health` behind `DATABASE_URL` with seeded data and timing assertions.
3. Wire `backup.sh` to a real `PGPASSWORD` secret and off-site object storage for dumps.

*This file is a template; for production sign-off, paste CI job URL and the latest Vitest output.*
