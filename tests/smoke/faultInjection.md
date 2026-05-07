# Fault injection smoke (F9.1 / F9.2)

Run with `npm run dev` and a live Postgres. Record **actual** status codes and bodies here after each run (this file ships as a checklist; fill in on your machine).

## T9.1 — Bad JSON to `POST /api/this-month/generate-now`

```bash
curl -s -w "\n%{http_code}\n" -X POST http://127.0.0.1:3002/api/this-month/generate-now \
  -H "Content-Type: application/json" \
  -d 'notjson{{'
```

- **Expected:** HTTP 400 (or similar 4xx), JSON error body, server stays up.
- **Actual status:** ___
- **Actual body (truncated):** ___

## T9.2 — Concurrent double POST `generate-now`

Two terminals, same second:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://127.0.0.1:3002/api/this-month/generate-now -H "Content-Type: application/json" -d "{}"
```

Then:

```sql
SELECT COUNT(*) FROM "AllocationPlan"
WHERE "monthYear" = TO_CHAR(NOW(), 'YYYY-MM');
```

- **Expected:** At most one new PROPOSED/CONFIRMED plan for current month (often 409 `PLAN_ALREADY_EXISTS` on the second call).
- **Actual:** ___

## T9.3 — Invalid AI / provider key

Temporarily set `ANTHROPIC_API_KEY=sk-invalid` (or invalid OpenAI key in Settings), restart, trigger `/api/intelligence/ask` or Telegram `/ai`.

- **Expected:** Graceful error to client; optional `SystemHealth` row; server stays up.
- **Actual:** ___

## T9.4 — Postgres stop mid-request

Not automated here — document outcome if you run it.

## T9.5 — Historical import bad ISIN

If `scripts/import-historical-navs.ts` exists in your tree, add an invalid ISIN and run the script; note whether valid ISINs still progress and how errors are aggregated.

- **Actual:** ___
