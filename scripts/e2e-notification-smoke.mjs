#!/usr/bin/env node
import { randomUUID } from "crypto";

/**
 * Minimal smoke: create one booking (mock user/vehicle) → expect BOOKING_CREATED in notification API.
 * No payment/Kafka. Use to verify Redis + notification-service + booking share the same store.
 *
 *   node scripts/e2e-notification-smoke.mjs
 *   BOOKING_URL=... NOTIFICATION_URL=... node scripts/e2e-notification-smoke.mjs
 */

const BOOKING_URL = process.env.BOOKING_URL || "http://localhost:5004";
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || "http://localhost:5007";

async function fetchNotificationList(userId) {
  const base = NOTIFICATION_URL.replace(/\/$/, "");
  const paths = [
    process.env.NOTIFICATION_LIST_PATH,
    "/notifications",
    "/",
  ].filter(Boolean);

  let last = null;
  for (const p of paths) {
    const res = await fetch(
      `${base}${p}?userId=${encodeURIComponent(userId)}`,
    );
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (res.ok) {
      return body?.data?.notifications ?? [];
    }
    last = res.status;
  }
  throw new Error(`Notification list failed (last status ${last})`);
}

const USER_ID = "e2e-smoke-user-00000001-0000-4000-8000-000000000001";
const VEHICLE_ID = `e2e-smoke-veh-${randomUUID()}`;

function tomorrowIso(daysAhead = 2) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(14, 0, 0, 0);
  return d.toISOString();
}

async function json(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function main() {
  console.log("Smoke: booking → Redis → notification (BOOKING_CREATED)\n");

  const h = await fetch(`${NOTIFICATION_URL.replace(/\/$/, "")}/health`);
  if (!h.ok) {
    console.error("notification-service not reachable");
    process.exit(1);
  }

  const startAt = tomorrowIso(2);
  const endAt = tomorrowIso(3);

  const createRes = await fetch(`${BOOKING_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      pickupBranchId: "e2e-branch-pickup",
      startAt,
      endAt,
      baseAmount: 100,
      platformFee: 0,
      serviceFee: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 100,
      status: "CONFIRMED",
    }),
  });

  const created = await json(createRes);
  if (!createRes.ok) {
    console.error("Create booking failed:", createRes.status, created);
    process.exit(1);
  }

  const bookingId = created?.data?.booking?.id;
  console.log("Created booking:", bookingId);

  const deadline = Date.now() + 10_000;
  let list = [];
  while (Date.now() < deadline) {
    try {
      list = await fetchNotificationList(USER_ID);
    } catch {
      list = [];
    }
    const keys = list.map((n) => n.eventKey).filter(Boolean);
    if (keys.includes("BOOKING_CREATED")) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const keys = list.map((n) => n.eventKey).filter(Boolean);
  console.log("Notification eventKeys:", [...new Set(keys)].sort().join(", ") || "(none)");

  if (keys.includes("BOOKING_CREATED")) {
    console.log("\nOK — BOOKING_CREATED persisted.");
    process.exit(0);
  }

  console.error(
    "\nFAIL — expected BOOKING_CREATED. Check REDIS_URL matches across booking + notification.",
  );
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
