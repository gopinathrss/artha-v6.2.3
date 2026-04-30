-- CreateTable
CREATE TABLE "IndiaMutualFund" (
    "id" TEXT NOT NULL,
    "schemeName" TEXT NOT NULL,
    "amfiCode" TEXT NOT NULL,
    "isin" TEXT,
    "amc" TEXT,
    "category" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "avgNavInr" DOUBLE PRECISION,
    "currentNavInr" DOUBLE PRECISION,
    "lastNavUpdate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "folioNumber" TEXT,
    "sipActive" BOOLEAN NOT NULL DEFAULT false,
    "sipAmountInr" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndiaMutualFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndiaFixedDeposit" (
    "id" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "principalInr" DOUBLE PRECISION NOT NULL,
    "interestRatePct" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "interestType" TEXT NOT NULL DEFAULT 'CUMULATIVE',
    "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndiaFixedDeposit_pkey" PRIMARY KEY ("id")
);
