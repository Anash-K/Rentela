import { Queue } from "bullmq";

import { bullmqQueueConnection } from "../libs/bullmqConnection.js";

export const HOLD_EXPIRY_QUEUE_NAME = "booking-hold-expiry";

let queueSingleton = null;

export function getHoldExpiryQueue() {
  if (!queueSingleton) {
    queueSingleton = new Queue(HOLD_EXPIRY_QUEUE_NAME, {
      connection: bullmqQueueConnection,
    });
  }
  return queueSingleton;
}

/**
 * Delayed job fires when hold window ends (no cron — BullMQ delayed jobs).
 * Stable jobId keeps reschedule idempotent.
 */
export async function scheduleHoldExpiryJob(bookingId, holdExpiresAt) {
  const queue = getHoldExpiryQueue();
  const jobId = `hold-expiry:${bookingId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    try {
      await existing.remove();
    } catch {
      // ignore
    }
  }
  const expiresMs = new Date(holdExpiresAt).getTime();
  const delay = Math.max(0, expiresMs - Date.now());
  await queue.add(
    "expire-hold",
    { bookingId },
    {
      jobId,
      delay,
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 500,
      removeOnFail: 2500,
    },
  );
}

export async function removeHoldExpiryJob(bookingId) {
  const queue = getHoldExpiryQueue();
  const job = await queue.getJob(`hold-expiry:${bookingId}`);
  if (job) {
    try {
      await job.remove();
    } catch {
      // ignore
    }
  }
}
