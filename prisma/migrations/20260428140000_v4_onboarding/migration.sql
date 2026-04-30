-- Onboarding flag (persistent "Complete setup" until true)
ALTER TABLE "Settings" ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
