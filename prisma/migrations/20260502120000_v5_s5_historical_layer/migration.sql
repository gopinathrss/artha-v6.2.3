-- Tier 2 historical NAV store + derived stats (V5 Sprint 5)

CREATE TABLE "HistoricalNavSummary" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nav" DECIMAL(14,6) NOT NULL,
    "resolution" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalNavSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HistoricalNavSummary_isin_date_key" ON "HistoricalNavSummary"("isin", "date");
CREATE INDEX "HistoricalNavSummary_isin_date_idx" ON "HistoricalNavSummary"("isin", "date");
CREATE INDEX "HistoricalNavSummary_resolution_idx" ON "HistoricalNavSummary"("resolution");

CREATE TABLE "HistoricalNavStats" (
    "isin" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "cagr1y" DECIMAL(7,4),
    "cagr3y" DECIMAL(7,4),
    "cagr5y" DECIMAL(7,4),
    "cagr10y" DECIMAL(7,4),
    "maxDrawdown1y" DECIMAL(7,4),
    "maxDrawdown3y" DECIMAL(7,4),
    "maxDrawdown5y" DECIMAL(7,4),
    "maxDrawdownAll" DECIMAL(7,4),
    "volatility1y" DECIMAL(7,4),
    "sharpe3y" DECIMAL(6,4),
    "recoveryMonths" INTEGER,
    "dataPointCount" INTEGER NOT NULL,
    "oldestDate" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalNavStats_pkey" PRIMARY KEY ("isin")
);
