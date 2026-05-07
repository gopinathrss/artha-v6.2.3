-- Dashboard login toggle (Settings UI). Env PIE_DASHBOARD_AUTH=0 still forces login off for recovery.
ALTER TABLE "AppSettings" ADD COLUMN "dashboardAuthEnabled" BOOLEAN NOT NULL DEFAULT false;
