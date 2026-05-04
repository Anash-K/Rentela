#!/usr/bin/env node
/**
 * Publish a synthetic booking event on Redis using the same client config as booking-service.
 * Run from repo root with booking-service env (REDIS_URL):
 *
 *   cd services/booking-service && node scripts/e2e-publish-notification.mjs
 *
 * Then GET notification-service /?userId=e2e-redis-test-user
 */
import "dotenv/config";

import { redis } from "../src/libs/redis.js";

const CHANNEL = process.env.BOOKING_NOTIFY_CHANNEL || "booking:notify";
const USER_ID = "e2e-redis-test-user-00000001-0000-4000-8000-000000000099";

const payload = {
  eventType: "BOOKING_CREATED",
  bookingId: "00000000-0000-4000-8000-00000000e2e1",
  userId: USER_ID,
  vehicleId: "00000000-0000-4000-8000-00000000e2e2",
  status: "CONFIRMED",
  message: "Redis synthetic test message",
  dedupeKey: `e2e-redis-publish:${Date.now()}`,
  emittedAt: new Date().toISOString(),
};

await redis.publish(CHANNEL, JSON.stringify(payload));
console.log("Published to", CHANNEL, "userId=", USER_ID);
await redis.quit();
