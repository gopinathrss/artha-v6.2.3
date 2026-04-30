-- Client vs internal CFO reports
ALTER TABLE "GeneratedReport" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'INTERNAL';
