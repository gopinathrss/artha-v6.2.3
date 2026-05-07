# PIE environment variables (VPS / production)

Reference list from `process.env` usage in `src/` (excluding tests). Set in `.env` on the server; never commit real secrets.

## Required for production

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string (main / personal DB). |
| `DATABASE_URL_DEMO` | Demo DB when demo mode is on (isolated schema or DB). |
| `NODE_ENV` | `production` for VPS. |
| `SESSION_SECRET` | Session / OAuth state signing (use `openssl rand -hex 32`). |
| `PORT` | HTTP port (default `3002`; keep behind Nginx). |

## Strongly recommended

| Variable | Purpose |
| -------- | ------- |
| `PIE_PUBLIC_URL` | Public base URL for OAuth redirects and links (e.g. `https://pie.example.com`). |
| `PIE_SECRET_KEY_PATH` or `ARTHA_SECRET_KEY_PATH` | Path to AES keyfile for encrypted integration secrets (e.g. `/home/user/.artha/secret.key`). |
| `PIE_DASHBOARD_AUTH` | Set `0` only for lockout recovery; otherwise use Settings. |
| `PIE_AUTH_BOOTSTRAP_KEY` | Optional first-time bootstrap phrase if not set in AppSettings. |

## Optional integrations

| Variable | Purpose |
| -------- | ------- |
| `ANTHROPIC_API_KEY` | Claude (fallback if not stored in DB). |
| `OPENAI_API_KEY` | OpenAI fallback. |
| `GEMINI_API_KEY` | Gemini fallback. |
| `ANTHROPIC_MODEL` | Default Anthropic model id (legacy helper). |
| `TELEGRAM_BOT_TOKEN` | Telegram fallback. |
| `EXCHANGE_RATE_API_KEY` | ExchangeRate-API. |
| `PIE_GOOGLE_OAUTH_CLIENT_ID` / `PIE_GOOGLE_OAUTH_CLIENT_SECRET` | Gmail OAuth (or save in Integrations UI). |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Aliases for Google OAuth env resolution. |

## SMTP / email (legacy env; prefer Integrations)

| Variable | Purpose |
| -------- | ------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Legacy SMTP (if still read by tooling). |
| `PIE_SMTP_INSECURE_TLS` | Set `1` only if TLS verify must be disabled (broken certs). |

## Security / ops

| Variable | Purpose |
| -------- | ------- |
| `PIE_EXTERNAL_API_KEY` / `ARTHA_EXTERNAL_API_KEY` | Gate for external read-only API. |
| `PIE_EXTERNAL_API_PATHS` / `ARTHA_EXTERNAL_API_PATHS` | Comma-separated allowed paths (default includes `/api/overview`, etc.). |
| `PIE_HEALTHZ_STRICT_AI` / `ARTHA_HEALTHZ_STRICT_AI` | Set `1` for stricter health checks around AI. |
| `PIE_DEBUG_AI_CONTEXT` / `ARTHA_DEBUG_AI_CONTEXT` | `1` for verbose AI logging (dev). |
| `PUBLIC_BASE_URL` / `ARTHA_PUBLIC_URL` | Alternate bases for plan emails / delivery. |
| `PIE_OAUTH_STATE_SECRET` | Override OAuth state secret (defaults with `SESSION_SECRET`). |

## Windows dev (local)

| Variable | Purpose |
| -------- | ------- |
| `APPDATA` / `LOCALAPPDATA` | Used to locate default secret keyfile path on Windows. |

Re-scan after upgrades:

```bash
# from repo root (with ripgrep)
rg "process\.env\.[A-Za-z0-9_]+" src --type ts -o | sort -u
```
