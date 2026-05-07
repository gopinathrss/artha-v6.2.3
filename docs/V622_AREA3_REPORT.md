# PIE V6.2.2 — Area 3 settings functional fixes (sprint report)

## Scope

Five targeted changes only (no layout restructure; that is V6.2.3).

## Delivered

### FIX 1 — Minimum sell threshold

- **Schema:** `AppSettings.minSellThresholdCzk` `Decimal(10,2)` default `1000` (`prisma/schema.prisma`).
- **Migration:** `prisma/migrations/20260507180000_v622_area3_min_sell_threshold/migration.sql`.
- **Planner:** `detectRebalanceSells` in `src/lib/sellEngine/rebalanceDrift.ts` skips each REBALANCE_DRIFT candidate when `Math.round(sellAmount) < minSellThresholdCzk` (default 1000). `allocationPlanner.ts` passes `merged.minSellThresholdCzk`.
- **Merge / API:** `getMergedSettings` exposes `minSellThresholdCzk`; `appSettingsPatchData` and `validateAppSettingsPatch` support POST updates.
- **Settings UI:** App preferences field `min-sell-threshold`, wired to save/load.
- **Tests:** `tests/unit/rebalanceDrift.test.ts` — sell ~266 Kč suppressed at threshold 1000; sell ≥1000 Kč retained.

### FIX 2 — Claude + Gemini in AI section

- **Backend:** `ai.anthropic` / `ai.gemini` already in `PROVIDER_REGISTRY`. `testRunner.ts` uses minimal Anthropic `messages.create` (`max_tokens: 1`), Gemini REST; **`ANTHROPIC_API_KEY` / `GEMINI_API_KEY`** env fallbacks when DB secret is empty.
- **Models (presets):** Claude — `claude-sonnet-4-5`, `claude-haiku-4-5-20251001`; Gemini — `gemini-1.5-pro`, `gemini-1.5-flash`.
- **UI:** Three **provider cards** (`#ai_provider_cards`) with status badge, model, API key, Save, Test, last tested; **Active** line `#ai_active_banner` (e.g. `Active: OpenAI (gpt-4o)`). Dropdown + Apply selection unchanged.

### FIX 3 — Risk profile shows merged value

- **API:** `GET /api/app-settings` includes `effectiveRiskProfile` from `getMergedSettings` (UserProfile wins per Area 2).
- **Overview:** `mergedRiskProfile` on `getPortfolioSummary` for `/api/overview` fallback.
- **Settings:** Risk dropdown loads from `effectiveRiskProfile`, then overview paths, then `MODERATE`. Note on Finances priority in UI.

### FIX 4 — Risk profile source label

- **UI:** `#risk-profile-source` with link to `/finances` (and `#as_risk_priority_note` for Finances priority).

### FIX 5 — Intelligence summary widget

- **Placement:** New card section immediately **above** System health.
- **Data:** `GET /api/strategies` + `GET /api/capital-efficiency` on load (`loadIntelligenceSummary` in `settings.js`).
- **Styles:** `components.css` — `.intelligence-summary-widget`, `.isw-*`.

## Gate results (local)

| Check        | Result |
| ------------ | ------ |
| `tsc --noEmit` | Exit 0 |
| `vitest run`   | 190 passed (2 new drift-threshold tests; suite includes skips) |

## Operational notes

- After pulling schema changes, run **`npx prisma generate`** (and migrate) so generated `AppSettings` types include `minSellThresholdCzk`. Until then, `appSettingsMerge.ts` uses narrow casts for that field so `tsc` stays green.
- **May plan / Corporate Bonds sell:** With default 1 000 Kč threshold, trivial drift sells (e.g. &lt; 1 000 Kč) should disappear — confirm on your DB after migrate + regenerate plan (not executed in this agent run).

## V6.2.3 (deferred) — visual / UX

- Optional: tighten spacing between App preferences hints and allocation card.
- Optional: single-card vs grid breakpoint tuning for AI cards on narrow viewports.
- Intelligence summary could share typography tokens with other stat widgets for perfect visual parity.
