-- V6: customization fields on AppSettings
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT 'BLUE';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "customCategories" JSONB NOT NULL DEFAULT '[]'::jsonb;
