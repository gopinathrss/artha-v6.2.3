-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('INVESTABLE', 'EMERGENCY_FUND', 'LONG_TERM_RESERVE', 'SLEEPING', 'GEO_STRATEGIC', 'LOCKED');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "accountRole" "AccountRole" NOT NULL DEFAULT 'INVESTABLE';
ALTER TABLE "Account" ADD COLUMN "interestTiers" JSONB;
ALTER TABLE "Account" ADD COLUMN "emergencyFundTarget" DECIMAL(18,2);
ALTER TABLE "Account" ADD COLUMN "fxTrendNote" TEXT;
ALTER TABLE "Account" ADD COLUMN "capitalEfficiencyNote" TEXT;

-- CreateTable
CREATE TABLE "MacroData" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueDecimal" DECIMAL(10,4),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MacroData_key_key" ON "MacroData"("key");

-- Seed roles from existing type/currency (idempotent-ish: only overrides defaults where rules match)
UPDATE "Account" SET "accountRole" = 'GEO_STRATEGIC'
WHERE UPPER(TRIM("currency")) = 'INR' AND UPPER(TRIM("type")) IN ('NRE', 'NRO');

UPDATE "Account" SET "accountRole" = 'LOCKED'
WHERE UPPER(TRIM("type")) = 'FIXED_DEPOSIT';

UPDATE "Account" SET "accountRole" = 'LOCKED'
WHERE UPPER(TRIM("type")) = 'PENSION';

UPDATE "Account" SET "accountRole" = 'LONG_TERM_RESERVE'
WHERE UPPER(TRIM("type")) = 'SAVINGS' AND UPPER(TRIM("currency")) = 'CZK';
