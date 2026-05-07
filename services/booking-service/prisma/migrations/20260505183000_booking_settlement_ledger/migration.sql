-- Settlement modes + cumulative settlement accounting + idempotent payment application ledger

CREATE TYPE "SettlementMode" AS ENUM ('PAY_AT_BOOKING', 'PAY_AFTER_TRIP', 'DEPOSIT_AND_SETTLE');

ALTER TABLE "Booking"
ADD COLUMN IF NOT EXISTS "settlementMode" "SettlementMode" NOT NULL DEFAULT 'DEPOSIT_AND_SETTLE',
ADD COLUMN IF NOT EXISTS "quotedTotalAmount" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "amountPaidCumulative" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "finalTotalAmount" DECIMAL(10,2);

UPDATE "Booking"
SET "quotedTotalAmount" = "totalAmount"
WHERE "quotedTotalAmount" IS NULL;

CREATE TABLE IF NOT EXISTS "BookingPaymentApplication" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "phase" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookingPaymentApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingPaymentApplication_paymentId_key" UNIQUE ("paymentId")
);

CREATE INDEX IF NOT EXISTS "BookingPaymentApplication_bookingId_idx" ON "BookingPaymentApplication" ("bookingId");

ALTER TABLE "BookingPaymentApplication"
ADD CONSTRAINT "BookingPaymentApplication_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
