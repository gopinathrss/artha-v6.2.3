-- Shape B: CZK equivalent for non-CZK accounts is derived at read time (accountToCzk).
-- Rename persisted column; nullable; NULL except CZK rows where snapshot mirrors balanceLocal.

ALTER TABLE "Account" RENAME COLUMN "balanceCzk" TO "balanceCzkSnapshot";
ALTER TABLE "Account" ALTER COLUMN "balanceCzkSnapshot" DROP NOT NULL;
UPDATE "Account" SET "balanceCzkSnapshot" = NULL WHERE UPPER(TRIM("currency")) <> 'CZK';
UPDATE "Account" SET "balanceCzkSnapshot" = "balanceLocal" WHERE UPPER(TRIM("currency")) = 'CZK';
ALTER TABLE "Account" ALTER COLUMN "balanceCzkSnapshot" DROP DEFAULT;
