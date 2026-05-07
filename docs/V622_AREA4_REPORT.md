# V6.2.2 Area 4 — Final hardening + VPS prep

## Memory heap (FIX 1)

### Diagnosis

- **`MEMORY_HEALTHY`** in `src/lib/health.ts` compares `heapUsed / heapTotal` (V8 heap pressure, not RSS).
- **Previous behavior:** PASS &lt;80%, WARN 80–90%, **FAIL ≥90%** — easy to hit after normal module load (instrument library, Prisma, Express), so **93% reported as FAIL** without implying an OOM leak.
- **Startup:** `server.ts` seeds library, integrations, FX, scheduler, Telegram — retains normal Node heap; no separate “giant” preload beyond `seedLibraryWithTopETFs` (DB-backed, not a full in-memory cache of all history).

### Changes

- **Thresholds:** **PASS** &lt;80%, **WARN** 80–&lt;95%, **FAIL** ≥95% (message documents bands).
- **`/api/debug/memory`** (non-production only): `heapUsed`, `heapTotal`, `rss`, `external`, `pct`.
- **Heap cap:** `package.json` `dev` / `start` / `start:tsx` and `start-artha.bat` use **`--max-old-space-size=512`** to reduce sudden OOM on small VPS (does not fix leaks).

### Before/after (agent environment)

- No long-running local server in this session — **record baseline** on your machine: after boot, `curl http://localhost:3002/api/debug/memory` (dev) and note `pct`. If **pct** starts high with zero traffic, blame load is mostly V8 + modules; if it **climbs** over hours under cron, profile scheduler/handlers next.

### Root cause summary

- **Primary:** Aggressive **90% FAIL** threshold on **heapUsed/heapTotal**, not proof of leak.
- **Secondary:** Snapshots depended on **weekday 06:00 morning job**; dev laptops off overnight → stale snapshots unrelated to heap.

---

## Snapshot freshness (FIX 2)

### Root cause

- **`saveDailySnapshotFromPortfolio`** ran only inside **`runMorningJob`** (`0 6 * * 1-5` weekdays). **Weekends** and **machines off at 06:00** produced **no new rows** for days.

### Fix

- **`createDailySnapshot()`** in `triggers.ts`: `getPortfolioSummary()` + `saveDailySnapshotFromPortfolio` (no Yahoo loop).
- **Cron `daily-snapshot`:** `0 23 * * *` Europe/Prague — daily including weekends.
- **`REGISTERED_CRON_JOB_NAMES`:** includes `daily-snapshot`.
- **`POST /api/snapshots/trigger`:** manual upsert for today (backfill after deploy).

### Manual test

```bash
curl -b cookies.txt -X POST http://localhost:3002/api/snapshots/trigger
# Then GET /api/overview — snapshots[0].date should be today (calendar day).
```

**`SNAPSHOT_FRESHNESS`:** PASS if last snapshot &lt;2d, WARN &lt;7d, FAIL otherwise (unchanged logic).

---

## Decimal precision (FIX 3)

- **`serializeJsonBody`** in `src/lib/money.ts`: still emits **numbers** for `Prisma.Decimal` (no breaking API change).
- **Monitoring:** if `Math.abs(toNumber()) > Number.MAX_SAFE_INTEGER / 100`, **`console.warn`** with key and decimal string.
- **Current portfolio scale** (~0.86M CZK, projected FV ~5.5M): **safe** vs `MAX_SAFE_INTEGER`.
- **V6.2.3:** optional `/api/v2` with string monetary fields + contract tests.

---

## VPS deployment (FIX 4)

| Artifact | Path |
| -------- | ---- |
| Guide | `scripts/vps/DEPLOY.md` |
| Env reference | `scripts/vps/ENV_VARS.md` |
| Health script | `scripts/vps/health-check.sh` |
| Example env | `.env.example` (updated) |

- **n8n** default **5678**; PIE **3002** — no conflict if Nginx separates vhosts.
- **Production start:** `npm run build` then `npm run start` (512 MB old-space hint + `--env-file=.env`).

---

## V6.2.2 re-audit snapshot (F5)

### Closed (from V6.1 / earlier)

- NRE / India allocation / XIRR / planner emergency / lesson narrative / plaintext secrets — per prior areas.
- Sporoinvest / strategy sells; trivial Corporate Bonds drift sell — Areas 1–3.

### Carried to V6.2.3

- Full **string Decimal** API / v2.
- **CAGR** suppression threshold (daily vs monthly points).
- **Settings** visual restructure.
- **MoM** “unavailable” until **20+ days** of snapshots — should improve after **`daily-snapshot`** runs.
- **MEMORY** deep dive if RSS/heap grows under sustained load after threshold tweak.

---

## Gates (local)

| Check | Result |
| ----- | ------ |
| `tsc --noEmit` | run in CI / dev |
| `vitest run` | run in CI / dev |

---

## Git (operator)

Suggested messages from spec:

- `fix(area4): memory heap threshold + startup optimization`
- `fix(area4): daily snapshot cron + manual trigger`
- `fix(area4): decimal precision monitoring + V6.2.3 migration note`
- `docs(area4): VPS deployment scripts + Nginx config + PM2 setup`
- `docs(area4): V6.2.2 re-audit snapshot + V6.2.3 backlog`
- `feat(v622-area4): memory + snapshot + decimal + VPS prep`

Tags: `v622-area4-complete`, `v622-complete` — **push only after review.**
