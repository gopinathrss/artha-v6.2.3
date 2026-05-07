-- V5.1 Area 3: AllocationPlanRow (Approach B) + Settings.taxFreeWindowAllowsBuy
-- Down (manual): DROP TABLE "AllocationPlanRow"; DROP TYPE "PlanRowKind"; ALTER TABLE "Settings" DROP COLUMN "taxFreeWindowAllowsBuy";

CREATE TYPE "PlanRowKind" AS ENUM ('BUY', 'SELL', 'HOLD', 'RESERVE');

CREATE TABLE "AllocationPlanRow" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "PlanRowKind" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "amountCzk" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "isin" TEXT,
    "destination" TEXT,
    "source" TEXT,
    "sellSubtype" TEXT,
    "taxImpactCzk" DECIMAL(18,2),
    "currentValueCzk" DECIMAL(18,2),
    "holdReason" TEXT,
    "daysToAction" INTEGER,
    "executionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationPlanRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllocationPlanRow_planId_orderIndex_key" ON "AllocationPlanRow"("planId", "orderIndex");
CREATE INDEX "AllocationPlanRow_planId_orderIndex_idx" ON "AllocationPlanRow"("planId", "orderIndex");
CREATE INDEX "AllocationPlanRow_type_idx" ON "AllocationPlanRow"("type");
CREATE INDEX "AllocationPlanRow_isin_idx" ON "AllocationPlanRow"("isin");

ALTER TABLE "AllocationPlanRow" ADD CONSTRAINT "AllocationPlanRow_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AllocationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Settings" ADD COLUMN "taxFreeWindowAllowsBuy" BOOLEAN NOT NULL DEFAULT false;
