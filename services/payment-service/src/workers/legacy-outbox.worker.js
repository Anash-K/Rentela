/**
 * **Optional emergency fallback**: delivers only `BOOKING_PAID` rows from legacy `PaymentOutbox`
 * (direct HTTP to booking `/internal/bookings/:id/payment-status`).
 *
 * **Disabled by default.** Normal flow: Kafka `payment.completed` → booking-service consumer.
 * Invoice generation is **not** supported via this mechanism (ingress removed from invoice-service).
 */
import { OutboxStatus } from "../generated/prisma/index.js";
import prisma from "../libs/prisma.js";
import axios from "axios";

import {
  BOOKING_SERVICE_URL,
  LEGACY_OUTBOX_BATCH_SIZE,
  LEGACY_OUTBOX_BASE_BACKOFF_MS,
  LEGACY_OUTBOX_MAX_ATTEMPTS,
} from "../config/env.js";

function backoffMs(attempts) {
  const base = LEGACY_OUTBOX_BASE_BACKOFF_MS;
  return Math.min(600_000, base * 2 ** Math.min(attempts, 10));
}

async function processBookingPaidEntry(entry) {
  const payment = await prisma.payment.findUnique({ where: { id: entry.paymentId } });
  if (!payment) {
    await prisma.paymentOutbox.update({
      where: { id: entry.id },
      data: { status: OutboxStatus.FAILED, lastError: "Payment row missing" },
    });
    return;
  }

  if (!payment.bookingId) {
    throw new Error("BOOKING_PAID legacy outbox but payment.bookingId is null");
  }

  await axios.post(
    `${BOOKING_SERVICE_URL}/internal/bookings/${payment.bookingId}/payment-status`,
    { paymentStatus: "PAID", paymentId: payment.id },
    { timeout: 12000 },
  );
}

async function processEntries(entries) {
  for (const entry of entries) {
    const claimed = await prisma.paymentOutbox.updateMany({
      where: { id: entry.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING },
    });
    if (claimed.count === 0) continue;

    try {
      await processBookingPaidEntry(entry);
      await prisma.paymentOutbox.update({
        where: { id: entry.id },
        data: { status: OutboxStatus.COMPLETED, lastError: null, nextAttemptAt: null },
      });
    } catch (err) {
      const attempts = entry.attempts + 1;
      const terminal = attempts >= LEGACY_OUTBOX_MAX_ATTEMPTS;
      await prisma.paymentOutbox.update({
        where: { id: entry.id },
        data: {
          status: terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          attempts,
          lastError: String(err?.message || err),
          nextAttemptAt: terminal ? null : new Date(Date.now() + backoffMs(attempts)),
        },
      });
      console.error(`Legacy outbox BOOKING_PAID ${entry.id} failed:`, err.message);
    }
  }
}

export async function processLegacyOutboxBatch() {
  const now = new Date();
  const bookingRows = await prisma.paymentOutbox.findMany({
    where: {
      kind: "BOOKING_PAID",
      status: OutboxStatus.PENDING,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      attempts: { lt: LEGACY_OUTBOX_MAX_ATTEMPTS },
    },
    take: LEGACY_OUTBOX_BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });
  await processEntries(bookingRows);
}

export function startLegacyOutboxWorker(pollMs) {
  let timer;
  const tick = async () => {
    try {
      await processLegacyOutboxBatch();
    } catch (e) {
      console.error("Legacy outbox batch error:", e.message);
    }
    timer = setTimeout(tick, pollMs);
  };
  timer = setTimeout(tick, pollMs);
  return () => clearTimeout(timer);
}
