# V6.2.3 Area 1 — Settings Visual Restructuring

## Status: COMPLETE

## Pre-flight

- **Tag baseline (`git describe --tags`)**: not executed in this environment (git CLI unavailable in shell).
- **Gates (before changes)**:
  - `tsc --noEmit`: PASS
  - `vitest run`: PASS (191 passed)

## Section map (from P0.2 pre-read)

Settings page source: `src/dashboard/settings.html`

### Current top-to-bottom order (cards / blocks)

| Old section / card | Old id (if any) | Old position | Contents (high-level) |
|---|---:|---:|---|
| Appearance | — | 1 | Theme segmented toggle + status panel |
| App preferences (V5.2) | `app-prefs-v52` | 2 | Display currency, risk profile (+ hints), target wealth/date, timezone, accent, categories, min sell threshold, AI debug logging, dashboard login + bootstrap phrase, status |
| Allocation targets | — | 3 | Equity/Bonds/Cash inputs + sum validator + tax-free window toggle + status |
| Secrets at rest note | `secrets-at-rest-note` | 4 | One-line encryption status + key file path |
| Email ingestion | — | 5 | IMAP ingestion config + test/run now + status |
| Notifications | — | 6 | Alert email, Telegram chat id, monthly letter + alerts toggles + send test email + status |
| Demo mode | — | 7 | Demo toggle + persona + warning + status |
| AI provider (V5.2) | `ai-provider-v52` | 8 | Active provider dropdown + banner + provider cards + test status |
| Other integrations (V5.2) | `integrations-v52` | 9 | SMTP/Gmail OAuth, Telegram bot, IMAP test config, FX API rows |
| Intelligence summary widget | — | 10 | Approved/proposed, sleeping cash, annual loss |
| System health | `health` | 11 | Trust score + 19 checks grid |
| Data & backups | — | 12 | Download/restore/reset portfolio |

### Target 5-section structure (locked)

| New section | New section id | Variant | Cards / blocks to include (in order) |
|---|---|---|---|
| Profile & Security | `section-security` | security | Dashboard login + bootstrap phrase; secrets-at-rest info line |
| Financial Intelligence | `section-finance` | finance | Intelligence summary; Allocation targets; Risk profile (+ source label); Tax-free window toggle; Min sell threshold |
| Accounts & Integrations | `section-connect` | connect | AI providers; Email (SMTP/Gmail OAuth); Email ingestion (IMAP); Telegram bot; Exchange Rate API |
| Preferences | `section-prefs` | prefs | Appearance; Display currency; Timezone; Accent color; Custom categories |
| System & Data | `section-system` | system | Demo mode; AI debug logging; Data & backups; System health; Notifications |

## Notes (non-goals / guardrails)

- **No functional changes**: keep existing element ids and handlers; move DOM only.
- **No new API calls/routes** in this sprint.

## What moved where

- **Split `App preferences (V5.2)` into four visual cards** while keeping the same element ids and the single save handler:
  - **Profile & Security**: `as_dashboard_auth`, `as_bootstrap_phrase`, `as_bootstrap_hint`, and the `secrets-at-rest-note`.
  - **Financial Intelligence**: `as_risk` (+ hints), `as_target_wealth`, `as_target_date`, `min-sell-threshold`, and the **only** AppSettings save button `save-app-prefs` (+ `st_app_prefs` panel).
  - **Preferences**: `as_display_ccy`, `as_timezone`, `as_accent`, `as_categories` (saved via the same `save-app-prefs` button).
  - **System & Data**: `as_ai_debug` toggle (also saved via the same `save-app-prefs` button).

- **Sticky nav** added at top of page to jump to the 5 sections.

## Gates (post-change)

- `tsc --noEmit`: PASS
- `vitest run`: PASS (191 passed)


