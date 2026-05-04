#!/usr/bin/env node

import { randomUUID } from "crypto";
/**
 * End-to-end: mock booking → payment capture → persisted notifications (same mock IDs as e2e-booking-payment).
 *
 * Prerequisites (all pointing at the same Redis):
 *   - Redis
 *   - notification-service (NOTIFICATION_URL, default http://localhost:5007) + migrated DB
 *   - booking-service (BOOKING_URL), payment-service (PAYMENT_URL)
 *   - PAYMENT_PROVIDER=mock, ENABLE_DEV_PAYMENT_SIMULATION=true on payment-service
 *   - Kafka + booking payment.completed consumer + payment relay worker + invoice consumer (optional)
 *
 * Env:
 *   BOOKING_URL, PAYMENT_URL, NOTIFICATION_URL
 *   POLL_MS (default 1000), NOTIFY_WAIT_MS (default 120000) — wait for Kafka + relay after capture
 *
 * Usage:
 *   node scripts/e2e-booking-notification.mjs
 */

const BOOKING_URL = process.env.BOOKING_URL || "http://localhost:5004";
const PAYMENT_URL = process.env.PAYMENT_URL || "http://localhost:5006";
/** Optional gateway base when payment routes are only reachable under `/payments` (pathRewrite). */
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:5000";
/** Base URL of notification-service (no path). */
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || "http://localhost:5007";
const POLL_MS = Number(process.env.POLL_MS ?? 1000);
const NOTIFY_WAIT_MS = Number(process.env.NOTIFY_WAIT_MS ?? 120_000);

const USER_ID = "e2e-user-00000001-0000-4000-8000-000000000001";
const VEHICLE_ID = `e2e-veh-${randomUUID()}`;

/** Lifecycle notifications we always expect before payment async work */
const REQUIRED_KEYS = new Set([
  "BOOKING_CREATED",
  "BOOKING_STARTED",
  "BOOKING_COMPLETED",
  "CHECKOUT_CREATED",
]);

/** Async path after mock capture (Kafka + relay; invoice optional) */
const PAYMENT_ASYNC_KEYS = new Set([
  "PAYMENT_STATUS_UPDATED",
  "FINAL_BILL_READY",
  "INVOICE_GENERATED",
]);

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchNotifications() {
  const base = NOTIFICATION_URL.replace(/\/$/, "");
  const paths = [
    process.env.NOTIFICATION_LIST_PATH,
    "/notifications",
    "/",
  ].filter(Boolean);

  let lastErr;
  for (const p of paths) {
    const url = `${base}${p}?userId=${encodeURIComponent(USER_ID)}`;
    const res = await fetch(url);
    const j = await json(res);
    if (j.ok) {
      const list = j.body?.data?.notifications ?? j.body?.notifications ?? [];
      return Array.isArray(list) ? list : [];
    }
    lastErr = new Error(
      `Notification API ${p} ${j.status}: ${JSON.stringify(j.body).slice(0, 200)}`,
    );
  }
  throw lastErr;
}

function eventKeysFrom(notifications) {
  const keys = new Set();
  for (const n of notifications) {
    if (n?.eventKey) keys.add(n.eventKey);
  }
  return keys;
}

/**
 * Poll until PAYMENT_STATUS_UPDATED + FINAL_BILL_READY (Kafka + relay) or NOTIFY_WAIT_MS.
 * Invoice consumer may add INVOICE_GENERATED inside the same window.
 */
async function waitForAsyncNotifications(startedAt) {
  const deadline = startedAt + NOTIFY_WAIT_MS;
  let lastList = [];
  let lastKeys = new Set();

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    lastList = await fetchNotifications();
    lastKeys = eventKeysFrom(lastList);
    if (
      lastKeys.has("PAYMENT_STATUS_UPDATED") &&
      lastKeys.has("FINAL_BILL_READY")
    ) {
      return {
        list: lastList,
        keys: lastKeys,
        stopped: "payment_and_final_bill",
      };
    }
  }
  lastList = await fetchNotifications();
  lastKeys = eventKeysFrom(lastList);
  return { list: lastList, keys: lastKeys, stopped: "deadline" };
}

async function main() {
  console.log("E2E booking flow → notification alerts (mock data)\n");
  console.log(`BOOKING_URL=${BOOKING_URL}`);
  console.log(`PAYMENT_URL=${PAYMENT_URL}`);
  console.log(`NOTIFICATION_URL=${NOTIFICATION_URL}`);
  console.log(`userId=${USER_ID}\n`);

  const healthBase = NOTIFICATION_URL.replace(/\/$/, "");
  const health = await fetch(`${healthBase}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(
      "notification-service not reachable. Start it on NOTIFICATION_URL (default :5007).",
    );
    process.exit(1);
  }

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
    console.error("No booking id:", created.body);
    process.exit(1);
  }
  console.log("1. Booking created:", bookingId);

  const startBk = await fetch(`${BOOKING_URL}/${bookingId}/start`, {
    method: "POST",
    headers: { "x-user-id": USER_ID },
  });
  if (!(await json(startBk)).ok) {
    console.error("Start booking failed");
    process.exit(1);
  }
  console.log("2. Booking started");

  const completeBk = await fetch(`${BOOKING_URL}/${bookingId}/complete`, {
    method: "POST",
    headers: { "x-user-id": USER_ID },
  });
  if (!(await json(completeBk)).ok) {
    console.error("Complete booking failed");
    process.exit(1);
  }
  console.log("3. Booking completed");

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
    console.error("No payment id:", checkout.body);
    process.exit(1);
  }
  console.log("4. Checkout payment:", paymentId);

  const simulateUrls = [
    `${PAYMENT_URL.replace(/\/$/, "")}/internal/dev/simulate-capture/${paymentId}`,
    `${GATEWAY_URL.replace(/\/$/, "")}/payments/internal/dev/simulate-capture/${paymentId}`,
  ];

  let simulated = { ok: false, status: 0, body: {} };
  let simUrlUsed = "";
  for (const url of simulateUrls) {
    const simRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    simulated = await json(simRes);
    simUrlUsed = url;
    if (simulated.ok) break;
    if (simRes.status !== 404) break;
  }

  if (!simulated.ok) {
    console.error(
      "Simulate capture failed:",
      simulated.status,
      simulated.body,
      simUrlUsed ? `(tried last: ${simUrlUsed})` : "",
    );
    if (simulated.status === 403) {
      console.error(
        "Dev capture disabled — restart payment-service with PAYMENT_PROVIDER=mock (simulate is auto-enabled for mock), or ENABLE_DEV_PAYMENT_SIMULATION=true.",
      );
    }
    if (simulated.status === 404) {
      console.error(
        "Route missing on direct payment URL — use current payment-service, or set GATEWAY_URL and reach via /payments/internal/dev/simulate-capture/:id.",
      );
    }
    process.exit(1);
  }
  console.log("5. Simulated capture OK — waiting for async notifications…");

  const waitStarted = Date.now();
  const { keys: asyncKeys, stopped } = await waitForAsyncNotifications(waitStarted);

  let allList = await fetchNotifications();
  let allKeys = eventKeysFrom(allList);

  console.log(`   (wait finished: ${stopped}, ${Date.now() - waitStarted}ms)\n`);

  const missingRequired = [...REQUIRED_KEYS].filter((k) => !allKeys.has(k));
  const missingPaymentAsync = [...PAYMENT_ASYNC_KEYS].filter((k) => !allKeys.has(k));

  console.log("--- Notification eventKeys observed ---");
  console.log([...allKeys].sort().join(", ") || "(none)");

  console.log("\n--- Checks ---");
  let ok = true;
  if (missingRequired.length) {
    ok = false;
    console.log(
      "FAIL  Missing required lifecycle keys:",
      missingRequired.join(", "),
    );
    console.log(
      "      Ensure booking + notification share REDIS_URL and notification-service is running before the flow.",
    );
  } else {
    console.log("OK    Lifecycle:", [...REQUIRED_KEYS].join(", "));
  }

  if (missingPaymentAsync.includes("PAYMENT_STATUS_UPDATED")) {
    ok = false;
    console.log(
      "FAIL  Missing PAYMENT_STATUS_UPDATED — Kafka booking consumer may be down or slow.",
    );
  } else {
    console.log("OK    PAYMENT_STATUS_UPDATED");
  }

  if (missingPaymentAsync.includes("FINAL_BILL_READY")) {
    console.log(
      "WARN  Missing FINAL_BILL_READY — payment relay poll / Kafka delay (see EMITTED_EVENTS_POLL_MS).",
    );
  } else {
    console.log("OK    FINAL_BILL_READY");
  }

  if (missingPaymentAsync.includes("INVOICE_GENERATED")) {
    console.log(
      "WARN  Missing INVOICE_GENERATED — invoice-service consumer optional for this check.",
    );
  } else {
    console.log("OK    INVOICE_GENERATED");
  }

  console.log("\nSample rows (latest 8):");
  for (const n of allList.slice(0, 8)) {
    console.log(
      `  ${n.eventKey ?? "?"} | ${n.title ?? ""} | ${String(n.message ?? "").slice(0, 60)}`,
    );
  }

  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
