import { redis } from "../libs/redis.js";

const BOOKING_NOTIFY_CHANNEL =
  process.env.BOOKING_NOTIFY_CHANNEL || "booking:notify";

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
