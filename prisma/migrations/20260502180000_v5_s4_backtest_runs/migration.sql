-- Sprint 4: Backtest Lab persistence
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "initialValueCzk" DECIMAL(14,2) NOT NULL,
    "finalValueCzk" DECIMAL(14,2),
    "cagrPct" DECIMAL(7,4),
    "maxDrawdownPct" DECIMAL(7,4),
    "sharpeRatio" DECIMAL(6,4),
    "configJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BacktestRun_strategyName_startDate_idx" ON "BacktestRun"("strategyName", "startDate");
