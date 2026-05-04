import app from "./app.js";
import {
  ENABLE_DEV_PAYMENT_SIMULATION,
  ENABLE_LEGACY_OUTBOX_WORKER,
  LEGACY_OUTBOX_POLL_MS,
  PAYMENT_PROVIDER,
  PORT,
  EMITTED_EVENTS_POLL_MS,
} from "./config/env.js";
import { disconnectProducer } from "./kafka/producer.js";
import { startPaymentCompletedRelayWorker } from "./workers/payment-completed-relay.worker.js";
import { startLegacyOutboxWorker } from "./workers/legacy-outbox.worker.js";

let stopRelay = () => {};
let stopLegacyOutbox = () => {};

async function bootstrap() {
  /**
   * Kafka `payment.completed` is produced **only** here (relay polls `PaymentEmittedEvent`).
   * Producer connects lazily on first publish inside relay.
   */
  stopRelay = startPaymentCompletedRelayWorker(EMITTED_EVENTS_POLL_MS);

  if (ENABLE_LEGACY_OUTBOX_WORKER) {
    stopLegacyOutbox = startLegacyOutboxWorker(LEGACY_OUTBOX_POLL_MS);
  }

  const server = app.listen(PORT, () => {
    console.log(`Payment service running on ${PORT}`);
    console.log(
      `[payment-service] PAYMENT_PROVIDER=${PAYMENT_PROVIDER} ENABLE_DEV_PAYMENT_SIMULATION=${ENABLE_DEV_PAYMENT_SIMULATION}`,
    );
  });

  const shutdown = async () => {
    stopRelay();
    stopLegacyOutbox();
    await disconnectProducer();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("Payment service failed to start:", err);
  process.exit(1);
});
