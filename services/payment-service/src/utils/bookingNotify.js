import { redis } from "../libs/redis.js";

const BOOKING_NOTIFY_CHANNEL =
  process.env.BOOKING_NOTIFY_CHANNEL || "booking:notify";

/**
 * Fan-out to notification-service (Redis subscriber on BOOKING_NOTIFY_CHANNEL).
 * Failures are swallowed so payment relay completion is not blocked.
 */
export async function publishBookingNotify(payload) {
  try {
    await redis.publish(
      BOOKING_NOTIFY_CHANNEL,
      JSON.stringify({
        ...payload,
        emittedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // non-blocking
  }
}
