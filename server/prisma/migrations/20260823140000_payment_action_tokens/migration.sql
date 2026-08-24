-- A hash is stored rather than the bearer token that appears in the payment QR.
ALTER TABLE "Payment" ADD COLUMN "actionTokenHash" TEXT;
ALTER TABLE "Payment" ADD COLUMN "actionTokenExpiresAt" TIMESTAMP(3);
UPDATE "Payment"
SET "actionTokenHash" = md5("id" || "reference" || clock_timestamp()::text),
    "actionTokenExpiresAt" = "expiresAt"
WHERE "actionTokenHash" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "actionTokenHash" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "actionTokenExpiresAt" SET NOT NULL;
CREATE UNIQUE INDEX "Payment_actionTokenHash_key" ON "Payment"("actionTokenHash");
