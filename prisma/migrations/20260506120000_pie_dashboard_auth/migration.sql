-- Optional dashboard login (single password on AppSettings). Off until PIE_DASHBOARD_AUTH=1.
ALTER TABLE "AppSettings" ADD COLUMN "dashboardPasswordHash" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "dashboardPasswordResetTokenSha256" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "dashboardPasswordResetExpires" TIMESTAMP(3);
