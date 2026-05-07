# ARTHA methodology — headline metrics

## XIRR (money-weighted IRR)

We compute XIRR from signed cashflows (SIPs as outflows) plus the current portfolio value as a terminal inflow.

**When the headline percentage is hidden**

- **Insufficient history:** Fewer than 12 months between the earliest and latest cashflow used in the series (`monthsOfHistory < 12`). We do not show a headline rate until the book has enough time span for a meaningful annualized figure.
- **Estimate / proxy hidden (`ESTIMATE_HIDDEN`):** When the root-finder cannot bracket a stable IRR, the engine may fall back to a short-horizon annualized proxy. That number can swing wildly and mislead; we keep it only as `rawEstimate` in API responses for diagnostics and **never** show it in the dashboard or reports.

**When a number is shown**

`displayState === 'OK'` and `displayValue` is the annualized IRR (percent) you see in the UI.

See `XIRR_MIN_MONTHS_FOR_DISPLAY` and `computeXirrDisplay` in `src/lib/calculations.ts`.

## Inflow-weighted gain

For the whole book we report:

- `inflowWeightedGainCzk = totalCzk − totalInvested`
- `inflowWeightedGainPct = (inflowWeightedGainCzk / totalInvested) × 100`

Here `totalInvested` is the sum of SIP-style outflows (money put in), not a mark-to-market cost basis for every lot.

This ratio answers “how large is the book versus what I fed in?”, **not** “what was my time-weighted or annualized return?”. For that, use headline IRR when it is in `OK` state.

## Month-over-month change

We compare today’s net worth to a prior snapshot in two tiers:

1. **Tier 1:** Snapshot dated within **±10 days** of **30 days ago** (target: ~1 month lookback).
2. **Tier 2:** If none qualifies, use the **latest snapshot at least 20 days old**, and label the result with its age (`Change vs Nd ago`) so the UI does not pretend it is a strict calendar MoM.

If there is no snapshot older than 20 days, we return an explicit **unavailable** label instead of a silent null.

Implementation: `src/lib/momChange.ts` and `getPortfolioSummary` in `src/lib/portfolio.ts`.

## Plan storage model (V5.1 Area 3)

- **`AllocationPlanRow`** is the typed relational store for rows on **new** plans (created after Area 3). Each row has `type` (`PlanRowKind`), `orderIndex`, `amountCzk` (`Decimal`), optional type-specific columns, and `executionStatus`.
- **`AllocationPlan.allocations` JSON** remains a **denormalized cache** of the same rows. Writers run **`assertValidMonthYear`**, validate the array with **`parseAllocationsJsonStrict`** (shared validators in `src/lib/allocationPlanSchema.ts`), then persist JSON and rows in **one Prisma transaction** (`generateMonthlyPlan`, row PATCH paths, `markPlanRowDone`, bulk follow-through).
- **Legacy plans** (rows created before Area 3): may have JSON only. Readers use **`parsePlanAllocations`**, which tries strict validation first, then falls back to **`ensureRowType`** per element.
- **`schemaVersion` + `rows` wrapper** is accepted on read for forward compatibility; new writers still emit a **bare array** unless you opt into a wrapped shape later.

## Tax-free window policy (V5.1 Area 3)

- **Default (`Settings.taxFreeWindowAllowsBuy = false`):** For Czech equity **within 90 days** of the 3y tax-free anniversary, the planner **does not** emit a reduced **BUY** into that line; **`generateHoldRows`** already emits a **`HOLD`** with `TAX_WINDOW_NEAR`.
- **Override:** Set **`taxFreeWindowAllowsBuy`** to **true** in Settings (UI toggle on `/settings`) to restore the previous “reduced BUY in window” behaviour.

## `monthYear` guard (F12.3)

Production plan writes call **`assertValidMonthYear`** (`src/lib/allocationPlanGuards.ts`): roughly **10 years** into the past and **3 calendar months** ahead of the current UTC month. **Tests** may still insert arbitrary `monthYear` values without the guard. To remove existing far-future junk rows from the DB, run the SQL script **`scripts/area3-cleanup-far-future-plans.sql`** (after backup), then regenerate the current month’s plan.

## Secrets at rest (V5.1 Area 4 — F10.1)

- **Algorithm:** AES-256-GCM with random 12-byte IV; ciphertext + auth tag stored as `enc:v1:` + base64 in `Settings` (`smtpPass`, `imapPassword`, `openaiApiKey`, `telegramBotToken`).
- **Key file:** `%APPDATA%\artha\secret.key` on Windows (or `ARTHA_SECRET_KEY_PATH` override). If missing, the server generates a 32-byte key once and logs a warning — **back up this file**; losing it makes ciphertext unrecoverable.
- **Plaintext detection:** If a secret column holds a value that does **not** start with `enc:v1:`, **`getSecret`** writes a `SystemHealth` row (`checkName: SECRETS`, `WARN`) and throws **`PlaintextSecretError`** so callers fail loudly until the user re-saves from Settings.
- **Migration:** `npm run migrate:secrets` (`scripts/migrate-plaintext-secrets.ts`) encrypts existing plaintext values in place (opt-in, not on boot).

## Data retention (V5.1 Area 4 — F11.1 / F11.2)

- **Weekly job** `prune-old-rows` (Sunday 03:00 Europe/Prague) deletes old rows from `CronExecution`, `SystemHealth`, terminal `EmailIngestionPreview` rows, and **dismissed** `AlertLog` entries past retention. Defaults live on **`Settings`**: `cronExecutionRetentionDays` (90), `systemHealthRetentionDays` (60), `emailPreviewRetentionDays` (30), `alertLogDismissedRetentionDays` (90). **PENDING** email previews are never pruned by age.
- **Alert dedup** (`src/lib/alerts/dedup.ts`): the 30-day window controls when a dismissed alert can fire again logically; it is **not** an immediate physical delete — see inline comment there and `AlertLog` pruning above.
