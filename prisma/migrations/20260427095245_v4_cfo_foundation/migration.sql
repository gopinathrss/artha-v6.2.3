-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "homeCurrency" TEXT NOT NULL DEFAULT 'CZK',
    "taxResidency" TEXT NOT NULL DEFAULT 'CZ',
    "riskProfile" TEXT NOT NULL DEFAULT 'MODERATE',
    "monthlyNetIncomeCzk" DOUBLE PRECISION NOT NULL,
    "salaryDayOfMonth" INTEGER NOT NULL DEFAULT 15,
    "emergencyFundTarget" DOUBLE PRECISION NOT NULL,
    "retirementAge" INTEGER NOT NULL DEFAULT 50,
    "retirementMonthlyExpense" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "amountLocal" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCzk" DOUBLE PRECISION NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCommitment" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCzk" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "dueDayOfMonth" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpcomingEvent" (
    "id" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "budgetCzk" DOUBLE PRECISION NOT NULL,
    "reservedCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpcomingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationPlan" (
    "id" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAvailableCzk" DOUBLE PRECISION NOT NULL,
    "fixedExpensesCzk" DOUBLE PRECISION NOT NULL,
    "reservedEventsCzk" DOUBLE PRECISION NOT NULL,
    "investableCzk" DOUBLE PRECISION NOT NULL,
    "emergencyTopupCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocations" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "userOverride" JSONB,
    "executedAt" TIMESTAMP(3),
    "planSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SipExecution" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "executedDate" TIMESTAMP(3),
    "isin" TEXT NOT NULL,
    "fundName" TEXT NOT NULL,
    "amountCzk" DOUBLE PRECISION NOT NULL,
    "amountLocal" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "navAtExecution" DOUBLE PRECISION,
    "unitsAcquired" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "confirmationMethod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SipExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FXRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FXRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavHistory" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nav" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "NavHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalReturn" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "return1m" DOUBLE PRECISION,
    "return3m" DOUBLE PRECISION,
    "return6m" DOUBLE PRECISION,
    "return1y" DOUBLE PRECISION,
    "return3y" DOUBLE PRECISION,
    "return5y" DOUBLE PRECISION,
    "return10y" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHealth" (
    "id" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "lastSuccessful" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorJournal" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relatedIsin" TEXT,
    "impactCzk" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "AdvisorJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllocationPlan_monthYear_status_idx" ON "AllocationPlan"("monthYear", "status");

-- CreateIndex
CREATE INDEX "FXRate_base_quote_fetchedAt_idx" ON "FXRate"("base", "quote", "fetchedAt");

-- CreateIndex
CREATE INDEX "NavHistory_isin_idx" ON "NavHistory"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "NavHistory_isin_date_key" ON "NavHistory"("isin", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalReturn_isin_asOfDate_key" ON "HistoricalReturn"("isin", "asOfDate");

-- CreateIndex
CREATE INDEX "SystemHealth_checkName_checkedAt_idx" ON "SystemHealth"("checkName", "checkedAt");
