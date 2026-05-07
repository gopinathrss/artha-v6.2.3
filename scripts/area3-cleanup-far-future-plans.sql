-- V5.1 Area 3 — one-shot cleanup (run AFTER pg_dump backup).
-- Removes lessons linked only to far-future plans, then far-future plans, then current-month plan for regen.
-- Adjust the month threshold if needed (must stay consistent with assertValidMonthYear +3 month window).

-- 1) Lessons pointing at plans more than ~3 months out
DELETE FROM "BacktestLesson"
WHERE "linkedPlanId" IN (
  SELECT id FROM "AllocationPlan"
  WHERE "monthYear" > TO_CHAR(NOW() + INTERVAL '3 months', 'YYYY-MM')
);

-- 2) Far-future allocation plans
DELETE FROM "AllocationPlan"
WHERE "monthYear" > TO_CHAR(NOW() + INTERVAL '3 months', 'YYYY-MM');

-- 3) Current month plan (forces POST /api/this-month/generate-now to rebuild with lesson merge)
DELETE FROM "AllocationPlan"
WHERE "monthYear" = TO_CHAR(NOW(), 'YYYY-MM');
