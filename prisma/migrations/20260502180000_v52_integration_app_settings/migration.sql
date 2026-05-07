-- V5.2: AppSettings + IntegrationProvider + IntegrationStatus

CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "themeMode" TEXT NOT NULL DEFAULT 'AUTO',
    "displayCurrency" TEXT NOT NULL DEFAULT 'CZK',
    "defaultAiProviderKey" TEXT,
    "riskProfile" TEXT NOT NULL DEFAULT 'MODERATE',
    "demoModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "demoPersona" TEXT NOT NULL DEFAULT 'engineer',
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyLetterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "confidenceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taxFreeWindowAllowsBuy" BOOLEAN NOT NULL DEFAULT false,
    "aiDebugLogging" BOOLEAN NOT NULL DEFAULT false,
    "targetEquityPct" DECIMAL(7,4) NOT NULL DEFAULT 65,
    "targetBondsPct" DECIMAL(7,4) NOT NULL DEFAULT 25,
    "targetCashPct" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "targetWealthCzk" DECIMAL(14,2),
    "targetDate" TIMESTAMP(3),
    "cronExecutionRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "systemHealthRetentionDays" INTEGER NOT NULL DEFAULT 60,
    "emailPreviewRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "alertLogDismissedRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "autoIngestEmails" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationProvider_key_key" ON "IntegrationProvider"("key");

CREATE INDEX "IntegrationProvider_category_enabled_idx" ON "IntegrationProvider"("category", "enabled");

CREATE TABLE "IntegrationStatus" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "latencyMs" INTEGER,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationStatus_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationStatus_providerKey_testedAt_idx" ON "IntegrationStatus"("providerKey", "testedAt");

INSERT INTO "AppSettings" (
    "id",
    "themeMode",
    "displayCurrency",
    "defaultAiProviderKey",
    "riskProfile",
    "demoModeEnabled",
    "demoPersona",
    "alertsEnabled",
    "monthlyLetterEnabled",
    "confidenceEnabled",
    "taxFreeWindowAllowsBuy",
    "aiDebugLogging",
    "targetEquityPct",
    "targetBondsPct",
    "targetCashPct",
    "targetWealthCzk",
    "targetDate",
    "cronExecutionRetentionDays",
    "systemHealthRetentionDays",
    "emailPreviewRetentionDays",
    "alertLogDismissedRetentionDays",
    "onboardingComplete",
    "timezone",
    "autoIngestEmails",
    "createdAt",
    "updatedAt"
) VALUES (
    'default',
    'AUTO',
    'CZK',
    NULL,
    'MODERATE',
    false,
    'engineer',
    true,
    true,
    true,
    false,
    false,
    65,
    25,
    10,
    NULL,
    NULL,
    90,
    60,
    30,
    90,
    false,
    'Europe/Prague',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

UPDATE "AppSettings" AS a
SET
    "defaultAiProviderKey" = CASE
        WHEN s."aiProvider" = 'anthropic' THEN 'ai.anthropic'
        WHEN s."aiProvider" = 'openai' THEN 'ai.openai'
        ELSE COALESCE(a."defaultAiProviderKey", 'ai.openai')
    END,
    "riskProfile" = COALESCE(NULLIF(TRIM(s."riskProfile"), ''), a."riskProfile"),
    "demoModeEnabled" = s."demoModeEnabled",
    "demoPersona" = s."demoPersona",
    "alertsEnabled" = s."alertsEnabled",
    "monthlyLetterEnabled" = s."monthlyLetterEnabled",
    "confidenceEnabled" = s."confidenceEnabled",
    -- taxFreeWindowAllowsBuy is NOT on Settings until migration 20260504110000 runs after this one.
    -- Keep AppSettings default from INSERT above; a later sync path (app code / optional migration) can copy it.
    "targetEquityPct" = s."targetEquityPct",
    "targetBondsPct" = s."targetBondsPct",
    "targetCashPct" = s."targetCashPct",
    "targetWealthCzk" = s."targetWealthCzk",
    "targetDate" = s."targetDate",
    -- Retention TTL columns are NOT on Settings until migration 20260505120000 runs after this one.
    -- INSERT above already seeded AppDefaults (90/60/30/90); 20260603140000 copies from Settings when present.
    "onboardingComplete" = s."onboardingComplete",
    "timezone" = s."timezone",
    "autoIngestEmails" = s."autoIngestEmails",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    SELECT * FROM "Settings" ORDER BY "createdAt" ASC LIMIT 1
) s;
