-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MUTUAL_FUND',
    "category" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nav" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "currentValueCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlySipCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "purchaseStartDate" TIMESTAMP(3) NOT NULL,
    "taxFreeDate" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CZ',
    "institution" TEXT,
    "interestRatePct" DOUBLE PRECISION,
    "maturityDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashflow" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCzk" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SIP',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cashflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "balanceLocal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "balanceCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestRatePct" DOUBLE PRECISION,
    "maturityDate" TIMESTAMP(3),
    "country" TEXT NOT NULL DEFAULT 'CZ',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "terPct" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "availableInGeorge" BOOLEAN NOT NULL DEFAULT false,
    "lastPrice" DOUBLE PRECISION,
    "lastPriceDate" TIMESTAMP(3),
    "return1yr" DOUBLE PRECISION,
    "return3yr" DOUBLE PRECISION,
    "return5yr" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "netWorthCzk" DOUBLE PRECISION NOT NULL,
    "netWorthEur" DOUBLE PRECISION NOT NULL,
    "investedCzk" DOUBLE PRECISION NOT NULL,
    "gainCzk" DOUBLE PRECISION NOT NULL,
    "gainPct" DOUBLE PRECISION NOT NULL,
    "xirr" DOUBLE PRECISION,
    "xirrIsEstimate" BOOLEAN NOT NULL DEFAULT true,
    "equityPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bondsPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dataSnapshot" JSONB,
    "wasSent" BOOLEAN NOT NULL DEFAULT false,
    "sentViaEmail" BOOLEAN NOT NULL DEFAULT false,
    "sentViaTelegram" BOOLEAN NOT NULL DEFAULT false,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyLetter" (
    "id" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "portfolioSnapshot" JSONB NOT NULL,
    "aiConfidenceScore" INTEGER NOT NULL DEFAULT 0,
    "wasSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "targetEquityPct" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "targetBondsPct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "targetCashPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "targetWealthCzk" DOUBLE PRECISION,
    "targetDate" TIMESTAMP(3),
    "riskProfile" TEXT,
    "alertEmail" TEXT,
    "telegramChatId" TEXT,
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "telegramBotToken" TEXT,
    "openaiApiKey" TEXT,
    "aiProvider" TEXT NOT NULL DEFAULT 'openai',
    "monthlyLetterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "confidenceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "demoModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "demoPersona" TEXT NOT NULL DEFAULT 'engineer',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_isin_key" ON "Instrument"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_isin_date_key" ON "PriceHistory"("isin", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_date_key" ON "Snapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyLetter_monthYear_key" ON "MonthlyLetter"("monthYear");

-- AddForeignKey
ALTER TABLE "Cashflow" ADD CONSTRAINT "Cashflow_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
