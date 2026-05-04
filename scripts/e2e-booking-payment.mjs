#!/usr/bin/env node
/**
 * End-to-end smoke test: create booking → start → complete → checkout → simulate mock capture.
 *
 * Prerequisites:
 *   - booking-service (default http://localhost:5004), Redis, Postgres booking schema
 *   - payment-service (default http://localhost:5006), Postgres payment schema, PAYMENT_PROVIDER=mock
 *   - payment-service: ENABLE_DEV_PAYMENT_SIMULATION=true
 *
 * Usage:
 *   BOOKING_URL=http://localhost:5004 PAYMENT_URL=http://localhost:5006 node scripts/e2e-booking-payment.mjs
 */

const BOOKING_URL = process.env.BOOKING_URL || "http://localhost:5004";
const PAYMENT_URL = process.env.PAYMENT_URL || "http://localhost:5006";

const USER_ID = "e2e-user-00000001-0000-4000-8000-000000000001";
const VEHICLE_ID = "e2e-vehicle-00000001-0000-4000-8000-000000000002";

function tomorrowIso(daysAhead = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

async function json(res) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log("E2E booking + payment (mock)\n");

  const startAt = tomorrowIso(1);
  const endAt = tomorrowIso(2);

  const createRes = await fetch(`${BOOKING_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      pickupBranchId: "e2e-branch-pickup",
      returnBranchId: "e2e-branch-return",
      startAt,
      endAt,
      baseAmount: 5000,
      platformFee: 200,
      serviceFee: 100,
      taxAmount: 900,
      discountAmount: 0,
      totalAmount: 6200,
      includedKm: 100,
      extraPerKm: 12,
      extraPerHour: 500,
      status: "CONFIRMED",
    }),
  });
  const created = await json(createRes);
  if (!created.ok) {
    console.error("Create booking failed:", created.status, created.body);
    process.exit(1);
  }

  const bookingId = created.body?.data?.booking?.id;
  if (!bookingId) {
    console.error("No booking id in response:", created.body);
    process.exit(1);
  }
  console.log("1. Booking created:", bookingId);

  const startRes = await fetch(`${BOOKING_URL}/${bookingId}/start`, {
    method: "POST",
    headers: { "x-user-id": USER_ID },
  });
  const started = await json(startRes);
  if (!started.ok) {
    console.error("Start booking failed:", started.status, started.body);
    process.exit(1);
  }
  console.log("2. Booking started (ACTIVE):", started.body?.data?.booking?.status);

  const completeRes = await fetch(`${BOOKING_URL}/${bookingId}/complete`, {
    method: "POST",
    headers: { "x-user-id": USER_ID },
  });
  const completed = await json(completeRes);
  if (!completed.ok) {
    console.error("Complete booking failed:", completed.status, completed.body);
    process.exit(1);
  }
  console.log("3. Booking completed:", completed.body?.data?.booking?.status);

  const checkoutRes = await fetch(`${BOOKING_URL}/${bookingId}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": USER_ID,
    },
  });
  const checkout = await json(checkoutRes);
  if (!checkout.ok) {
    console.error("Checkout failed:", checkout.status, checkout.body);
    process.exit(1);
  }

  const paymentId = checkout.body?.data?.payment?.id;
  if (!paymentId) {
    console.error("No payment id in checkout response:", checkout.body);
    process.exit(1);
  }
  console.log("4. Checkout created payment:", paymentId);

  const simRes = await fetch(`${PAYMENT_URL}/internal/dev/simulate-capture/${paymentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const simulated = await json(simRes);
  if (!simulated.ok) {
    console.error("Simulate capture failed:", simulated.status, simulated.body);
    if (simulated.status === 403) {
      console.error("Restart payment-service with: ENABLE_DEV_PAYMENT_SIMULATION=true PAYMENT_PROVIDER=mock");
    }
    process.exit(1);
  }
  console.log("5. Simulated capture:", simulated.body?.data?.capture?.payment?.status || simulated.body);

  const bookingCheck = await fetch(`${BOOKING_URL}/${bookingId}`);
  const bookingJson = await json(bookingCheck);
  const ps = bookingJson.body?.data?.booking?.paymentStatus;
  console.log("6. Booking paymentStatus:", ps);

  const payCheck = await fetch(`${PAYMENT_URL}/${paymentId}`);
  const payJson = await json(payCheck);
  const st = payJson.body?.data?.payment?.status;
  console.log("7. Payment status:", st);

  if (ps === "PAID" && st === "SUCCESS") {
    console.log("\nOK — booking marked PAID and payment SUCCESS.");
    process.exit(0);
  }

  console.log("\nPartial success — verify Kafka relay/consumers if payment SUCCESS but booking not PAID yet.");
  process.exit(ps === "PAID" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
