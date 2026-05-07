-- Soft hold window for PENDING bookings (flight-style inventory lock).
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3);
