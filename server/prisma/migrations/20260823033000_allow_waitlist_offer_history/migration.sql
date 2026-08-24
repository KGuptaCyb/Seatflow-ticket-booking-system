-- Keep offer history so an expired offer can advance the seat to the next
-- customer in the category queue. Only BookingSeat remains one-to-one.
DROP INDEX IF EXISTS "WaitlistOffer_eventSeatId_key";

CREATE INDEX "WaitlistOffer_eventSeatId_status_idx"
ON "WaitlistOffer"("eventSeatId", "status");
