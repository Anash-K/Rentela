import pino from "pino";
import { Worker } from "bullmq";

import { ENABLE_BOOKING_HOLD_WORKER } from "../config/hold.js";
import { bullmqWorkerConnection } from "../libs/bullmqConnection.js";
import { HOLD_EXPIRY_QUEUE_NAME } from "../queues/holdExpiry.queue.js";
import { expireBookingHold } from "../services/booking.service.js";

const logger = pino({ name: "booking-hold-expiry-worker" });

/**
 * Processes one delayed job per PENDING hold — no polling/cron.
 */
export function startHoldExpiryWorker() {
  if (!ENABLE_BOOKING_HOLD_WORKER) {
    logger.info("Hold expiry worker disabled (ENABLE_BOOKING_HOLD_WORKER=false)");
    return () => Promise.resolve();
  }

  const worker = new Worker(
    HOLD_EXPIRY_QUEUE_NAME,
    async (job) => {
      if (job.name === "expire-hold" && job.data?.bookingId) {
        const result = await expireBookingHold(job.data.bookingId);
        logger.info({ bookingId: job.data.bookingId, result }, "hold expiry processed");
      }
    },
    { connection: bullmqWorkerConnection, concurrency: 8 },
  );

  worker.on("failed", (job, err) => {
    logger.warn(
      { err: err?.message, jobId: job?.id, bookingId: job?.data?.bookingId },
      "hold expiry job failed",
    );
  });

  logger.info("BullMQ hold expiry worker started");
  return async () => {
    await worker.close();
  };
}
