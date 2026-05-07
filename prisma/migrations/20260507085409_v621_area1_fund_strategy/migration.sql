-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('PROPOSED', 'APPROVED', 'MONITORING', 'PAUSED', 'COMPLETED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StrategyConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('TAX_WINDOW_REACHED', 'ALLOCATION_DRIFT', 'PROFIT_CAP_PCT', 'PROFIT_CAP_CZK', 'PROFIT_CAP_APPROACH', 'DRAWDOWN_RISK', 'DRAWDOWN_WARNING', 'REVIEW_DATE', 'STRATEGY_COMPLETE');

-- CreateEnum
CREATE TYPE "SignalStrength" AS ENUM ('STRONG_SELL', 'SOFT_SELL', 'REVIEW', 'HOLD', 'WARNING');

-- AlterTable
ALTER TABLE "AllocationPlanRow" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BacktestLesson" ALTER COLUMN "patternIds" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FundStrategy" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "status" "StrategyStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" "StrategyConfidence" NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "allocationPct" DECIMAL(5,2) NOT NULL,
    "allocationSleve" TEXT NOT NULL,
    "absoluteCapCzk" DECIMAL(18,2) NOT NULL,
    "monthlySipCzk" DECIMAL(18,2) NOT NULL,
    "monthsToTarget" INTEGER NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "profitCapPct" DECIMAL(6,2) NOT NULL,
    "profitCapCzk" DECIMAL(18,2) NOT NULL,
    "profitCapAdjustedAt" TIMESTAMP(3),
    "profitCapAdjustedFrom" DECIMAL(18,2),
    "drawdownGuardrailPct" DECIMAL(5,2) NOT NULL,
    "drawdownHistoricalMax" DECIMAL(5,2),
    "taxFreeDate" TIMESTAMP(3),
    "preferTaxFreeExit" BOOLEAN NOT NULL DEFAULT true,
    "proposalReasoning" TEXT NOT NULL,
    "keyMetrics" JSONB NOT NULL,
    "approvedBy" TEXT DEFAULT 'user',
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategySignal" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "signalType" "SignalType" NOT NULL,
    "strength" "SignalStrength" NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentValueCzk" DECIMAL(18,2),
    "costBasisCzk" DECIMAL(18,2),
    "gainPct" DECIMAL(6,2),
    "drawdownPct" DECIMAL(6,2),
    "allocationPct" DECIMAL(5,2),
    "reasoning" TEXT NOT NULL,
    "crossCheckResults" JSONB NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "userAction" TEXT,
    "userNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundStrategy_holdingId_key" ON "FundStrategy"("holdingId");

-- CreateIndex
CREATE INDEX "FundStrategy_holdingId_idx" ON "FundStrategy"("holdingId");

-- CreateIndex
CREATE INDEX "FundStrategy_status_idx" ON "FundStrategy"("status");

-- CreateIndex
CREATE INDEX "StrategySignal_strategyId_idx" ON "StrategySignal"("strategyId");

-- CreateIndex
CREATE INDEX "StrategySignal_holdingId_idx" ON "StrategySignal"("holdingId");

-- CreateIndex
CREATE INDEX "StrategySignal_signalType_idx" ON "StrategySignal"("signalType");

-- CreateIndex
CREATE INDEX "StrategySignal_firedAt_idx" ON "StrategySignal"("firedAt");

-- AddForeignKey
ALTER TABLE "FundStrategy" ADD CONSTRAINT "FundStrategy_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySignal" ADD CONSTRAINT "StrategySignal_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "FundStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
