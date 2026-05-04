import pino from "pino";

import prisma from "../libs/prisma.js";
import { publishBookingNotification } from "../services/booking.service.js";

const logger = pino({ name: "trip-reminder" });

const ENABLED = process.env.ENABLE_TRIP_REMINDER_WORKER !== "false";
const POLL_MS = Number(process.env.TRIP_REMINDER_POLL_MS ?? 300_000);
const MIN_MIN = Number(process.env.TRIP_REMINDER_MIN_MINUTES ?? 50);
const MAX_MIN = Number(process.env.TRIP_REMINDER_MAX_MINUTES ?? 70);

function windowBounds(now) {
  const minMs = MIN_MIN * 60_000;
  const maxMs = MAX_MIN * 60_000;
  return {
    lower: new Date(now.getTime() + minMs),
    upper: new Date(now.getTime() + maxMs),
  };
}

/**
 * Sends one pickup and one drop reminder per booking (dedupeKey), when the event falls
 * between MIN_MIN and MAX_MIN minutes from now (tunable; default ~1h window for 5m polls).
 */
export function startTripReminderWorker() {
  if (!ENABLED) {
    logger.info("Trip reminder worker disabled (ENABLE_TRIP_REMINDER_WORKER=false)");
    return () => Promise.resolve();
  }

  let timer;

  const run = async () => {
    const now = new Date();
    const { lower, upper } = windowBounds(now);
    try {
      const pickupBookings = await prisma.booking.findMany({
        where: {
          status: "CONFIRMED",
          OR: [
            { pickupTime: { gte: lower, lte: upper } },
            { AND: [{ pickupTime: null }, { startAt: { gte: lower, lte: upper } }] },
          ],
        },
        select: {
          id: true,
          userId: true,
          vehicleId: true,
          status: true,
          pickupTime: true,
          startAt: true,
        },
        take: 200,
      });

      for (const b of pickupBookings) {
        const at = b.pickupTime ?? b.startAt;
        await publishBookingNotification({
          eventType: "PICKUP_REMINDER",
          bookingId: b.id,
          userId: b.userId,
          vehicleId: b.vehicleId,
          status: b.status,
          pickupAt: at?.toISOString?.() ?? null,
          message: "Your pickup time is coming up soon",
          dedupeKey: `booking:${b.id}:pickup_reminder`,
        });
      }

      const dropBookings = await prisma.booking.findMany({
        where: {
          status: { in: ["ACTIVE", "OVERDUE"] },
          OR: [
            { dropTime: { gte: lower, lte: upper } },
            { AND: [{ dropTime: null }, { endAt: { gte: lower, lte: upper } }] },
          ],
        },
        select: {
          id: true,
          userId: true,
          vehicleId: true,
          status: true,
          dropTime: true,
          endAt: true,
        },
        take: 200,
      });

      for (const b of dropBookings) {
        await publishBookingNotification({
          eventType: "DROP_REMINDER",
          bookingId: b.id,
          userId: b.userId,
          vehicleId: b.vehicleId,
          status: b.status,
          dropAt: (b.dropTime ?? b.endAt)?.toISOString?.() ?? null,
          message: "Your return time is approaching — plan to drop off the vehicle",
          dedupeKey: `booking:${b.id}:drop_reminder`,
        });
      }
    } catch (e) {
      logger.warn({ err: e.message }, "Trip reminder tick failed");
    }
  };

  run();
  timer = setInterval(run, POLL_MS);
  logger.info(
    { pollMs: POLL_MS, minMin: MIN_MIN, maxMin: MAX_MIN },
    "Trip reminder worker started",
  );

  return async () => {
    if (timer) clearInterval(timer);
  };
}
