-- Preserve historic confirmed records while introducing the simulated-payment lifecycle.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'CANCELLED', 'DECLINED', 'EXPIRED');
ALTER TABLE "Booking" ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "convenienceFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "tax" INTEGER NOT NULL DEFAULT 0;
UPDATE "Booking" SET "subtotal" = "total" WHERE "subtotal" = 0;
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
