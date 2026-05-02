CREATE TABLE "BacktestLesson" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "fundName" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "cagr5y" DECIMAL(7,4),
    "maxDrawdown5y" DECIMAL(7,4),
    "recoveryMonths" INTEGER,
    "sharpe3y" DECIMAL(6,4),
    "narrative" TEXT NOT NULL,
    "linkedPlanId" TEXT,
    "linkedRowKey" TEXT,
    "patternIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "BacktestLesson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BacktestLesson_isin_extractedAt_idx" ON "BacktestLesson"("isin", "extractedAt");
CREATE INDEX "BacktestLesson_linkedPlanId_idx" ON "BacktestLesson"("linkedPlanId");
