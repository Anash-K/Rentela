/**
 * **Event relay worker** — the **only** component that publishes `payment.completed` to Kafka.
 *
 * Flow: `PaymentEmittedEvent` (ledger, `emittedAt` null) → fetch bill from booking-service → build envelope → Kafka produce → mark `emittedAt`.
 *
 * Webhook handlers **only** persist payment SUCCESS + ledger row; crashes before this worker runs do **not** lose events (rows remain pending).
 */
import prisma from "../libs/prisma.js";
import {
  EMITTED_EVENTS_BATCH_SIZE,
  EMITTED_EVENTS_POLL_MS,
} from "../config/env.js";
import { relayPaymentEmittedEvent } from "../services/payment-completed-relay.service.js";

export async function processPaymentCompletedRelayBatch() {
  const pending = await prisma.paymentEmittedEvent.findMany({
    where: { emittedAt: null },
    orderBy: { createdAt: "asc" },
    take: EMITTED_EVENTS_BATCH_SIZE,
    select: { paymentId: true },
  });

  for (const row of pending) {
    try {
      await relayPaymentEmittedEvent(row.paymentId);
    } catch {
      /** relay logs + increments emitAttempts */
    }
  }
}

export function startPaymentCompletedRelayWorker(pollMs = EMITTED_EVENTS_POLL_MS) {
  let timer;
  const tick = async () => {
    try {
      await processPaymentCompletedRelayBatch();
    } catch (e) {
      console.error("payment.completed relay batch error:", e.message);
    }
    timer = setTimeout(tick, pollMs);
  };
  void processPaymentCompletedRelayBatch();
  timer = setTimeout(tick, pollMs);
  return () => clearTimeout(timer);
}
