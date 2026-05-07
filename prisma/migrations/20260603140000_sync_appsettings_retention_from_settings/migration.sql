-- V6: Copy retention TTL fields from Settings → AppSettings after Settings has them
-- (migration 20260505120000). Idempotent.

UPDATE "AppSettings" AS a
SET
    "cronExecutionRetentionDays" = s."cronExecutionRetentionDays",
    "systemHealthRetentionDays" = s."systemHealthRetentionDays",
    "emailPreviewRetentionDays" = s."emailPreviewRetentionDays",
    "alertLogDismissedRetentionDays" = s."alertLogDismissedRetentionDays",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    SELECT * FROM "Settings" ORDER BY "createdAt" ASC LIMIT 1
) s
WHERE a."id" = 'default';
