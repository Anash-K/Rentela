-- At most one PENDING BOOKING row per (bookingId, gatewayProvider) — prevents double-checkout races
CREATE UNIQUE INDEX "Payment_booking_gateway_pending_unique"
ON "Payment" ("bookingId", "gatewayProvider")
WHERE "status" = 'PENDING'::"PaymentStatus"
  AND "type" = 'BOOKING'::"PaymentType"
  AND "bookingId" IS NOT NULL
  AND "gatewayProvider" IS NOT NULL;
