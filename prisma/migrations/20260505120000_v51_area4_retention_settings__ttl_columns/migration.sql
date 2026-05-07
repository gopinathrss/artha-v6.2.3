-- AlterTable: retention knobs for prune-old-rows (F11.1 / F11.2)
ALTER TABLE "Settings" ADD COLUMN "cronExecutionRetentionDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Settings" ADD COLUMN "systemHealthRetentionDays" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Settings" ADD COLUMN "emailPreviewRetentionDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "alertLogDismissedRetentionDays" INTEGER NOT NULL DEFAULT 90;
