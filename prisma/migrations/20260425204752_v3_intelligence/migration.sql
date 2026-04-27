-- CreateTable
CREATE TABLE "InstrumentLibrary" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "terPct" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "domicile" TEXT,
    "fundSizeM" DOUBLE PRECISION,
    "trackingError" DOUBLE PRECISION,
    "benchmark" TEXT,
    "availableInGeorge" BOOLEAN NOT NULL DEFAULT false,
    "lastPrice" DOUBLE PRECISION,
    "lastPriceDate" TIMESTAMP(3),
    "return1yr" DOUBLE PRECISION,
    "return3yr" DOUBLE PRECISION,
    "return5yr" DOUBLE PRECISION,
    "return10yr" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "scoreUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstrumentLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMemory" (
    "id" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionAsked" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "portfolioSnapshot" JSONB NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "keyNumbers" JSONB,
    "recommendations" JSONB,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "userFeedback" TEXT,
    "wasActioned" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndiaIntelligence" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "bankName" TEXT,
    "tenor" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "changeDirection" TEXT,
    "notes" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndiaIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "estimatedImpactCzk" DOUBLE PRECISION,
    "confidenceScore" INTEGER NOT NULL,
    "relatedIsin" TEXT,
    "userDecision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "result30d" TEXT,
    "result90d" TEXT,
    "actualImpactCzk" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentLibrary_isin_key" ON "InstrumentLibrary"("isin");
