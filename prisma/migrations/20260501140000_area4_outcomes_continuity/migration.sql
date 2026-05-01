-- Replace legacy RecommendationOutcome with plan-linked tracking (F5.4)
DROP TABLE IF EXISTS "RecommendationOutcome";

CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "rowType" TEXT NOT NULL,
    "isin" TEXT,
    "fundName" TEXT NOT NULL,
    "recommendedAmountCzk" DECIMAL(14,2) NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evaluatedAt30d" TIMESTAMP(3),
    "evaluatedAt90d" TIMESTAMP(3),
    "wasExecuted" BOOLEAN,
    "executedAmountCzk" DECIMAL(14,2),
    "valueAt30dCzk" DECIMAL(14,2),
    "valueAt90dCzk" DECIMAL(14,2),
    "gainPctAt30d" DECIMAL(8,4),
    "gainPctAt90d" DECIMAL(8,4),
    "outcomeScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecommendationOutcome_planId_idx" ON "RecommendationOutcome"("planId");
CREATE INDEX "RecommendationOutcome_status_idx" ON "RecommendationOutcome"("status");

ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AllocationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllocationPlan" ADD COLUMN "continuity" JSONB;

ALTER TABLE "SipExecution" ADD COLUMN "planRowKey" TEXT;
