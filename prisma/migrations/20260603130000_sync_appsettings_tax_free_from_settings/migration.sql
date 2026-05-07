-- V6: Copy taxFreeWindowAllowsBuy from legacy Settings → AppSettings.
-- The v52 migration (20260502180000) runs before Settings gains this column
-- (20260504110000), so the initial seed could not read it from Settings.
-- This migration is idempotent and safe when Settings has no row or column.

UPDATE "AppSettings" AS a
SET
    "taxFreeWindowAllowsBuy" = s."taxFreeWindowAllowsBuy",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    SELECT * FROM "Settings" ORDER BY "createdAt" ASC LIMIT 1
) s
WHERE a."id" = 'default';
