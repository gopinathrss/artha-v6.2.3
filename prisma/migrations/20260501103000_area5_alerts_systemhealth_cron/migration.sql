-- AlertLog dedup + dismissal (F9.2 / F9.5)
ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "alertKey" TEXT;
UPDATE "AlertLog" SET "alertKey" = 'legacy:' || "id" WHERE "alertKey" IS NULL;
ALTER TABLE "AlertLog" ALTER COLUMN "alertKey" SET NOT NULL;

ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "firstFiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "lastFiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "AlertLog" SET "firstFiredAt" = "firedAt", "lastFiredAt" = "firedAt" WHERE "firstFiredAt" IS NULL OR "lastFiredAt" IS NULL;

ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "fireCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "AlertLog" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AlertLog_alertKey_status_idx" ON "AlertLog"("alertKey", "status");

-- SystemHealth metadata for AI logging (F10.2)
ALTER TABLE "SystemHealth" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Cron execution ledger (F12.4)
CREATE TABLE IF NOT EXISTS "CronExecution" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "itemsProcessed" INTEGER,
    "errors" JSONB,
    "metadata" JSONB,

    CONSTRAINT "CronExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CronExecution_jobName_scheduledFor_idx" ON "CronExecution"("jobName", "scheduledFor");
