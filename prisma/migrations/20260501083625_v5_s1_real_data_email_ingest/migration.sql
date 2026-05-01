-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "holdReason" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "autoIngestEmails" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imapHost" TEXT,
ADD COLUMN     "imapPassword" TEXT,
ADD COLUMN     "imapPort" INTEGER DEFAULT 993,
ADD COLUMN     "imapUser" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "sipDayOfMonth" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "EmailIngestionPreview" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "parsedType" TEXT NOT NULL,
    "parsedAmount" DECIMAL(14,2),
    "parsedFundIsin" TEXT,
    "parsedFundName" TEXT,
    "parsedDate" TIMESTAMP(3),
    "rawBody" TEXT,
    "confidence" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "linkedExecutionId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerNote" TEXT,
    "messageIdHeader" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailIngestionPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailIngestionPreview_status_receivedAt_idx" ON "EmailIngestionPreview"("status", "receivedAt");
