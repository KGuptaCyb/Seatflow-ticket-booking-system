-- Existing rows contain a plaintext bearer token. They cannot be made secure
-- retroactively, so invalidate outstanding offers before removing that column.
UPDATE "EventSeat" s SET "status" = 'AVAILABLE', "heldById" = NULL, "holdExpiresAt" = NULL
WHERE s."status" = 'OFFERED' AND EXISTS (
  SELECT 1 FROM "WaitlistOffer" o WHERE o."eventSeatId" = s.id AND o."status" = 'PENDING'
);
UPDATE "WaitlistOffer" SET "status" = 'EXPIRED' WHERE "status" = 'PENDING';
ALTER TABLE "WaitlistOffer" ADD COLUMN "actionTokenHash" TEXT;
UPDATE "WaitlistOffer"
SET "actionTokenHash" = md5("id" || clock_timestamp()::text)
WHERE "actionTokenHash" IS NULL;
ALTER TABLE "WaitlistOffer" ALTER COLUMN "actionTokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "WaitlistOffer_actionTokenHash_key" ON "WaitlistOffer"("actionTokenHash");
DROP INDEX IF EXISTS "WaitlistOffer_token_key";
ALTER TABLE "WaitlistOffer" DROP COLUMN "token";
