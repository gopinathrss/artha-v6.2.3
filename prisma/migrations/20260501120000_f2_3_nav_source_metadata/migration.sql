-- F2.3: optional NAV refresh source metadata on Czech holdings
ALTER TABLE "Holding" ADD COLUMN IF NOT EXISTS "navSourceType" TEXT;
ALTER TABLE "Holding" ADD COLUMN IF NOT EXISTS "navSourceId" TEXT;
ALTER TABLE "Holding" ADD COLUMN IF NOT EXISTS "navLastFetchedAt" TIMESTAMP(3);
