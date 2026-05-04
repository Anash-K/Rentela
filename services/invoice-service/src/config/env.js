import "dotenv/config";

export const PORT = Number(process.env.PORT || 5012);

export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const PAYMENT_COMPLETED_TOPIC =
  process.env.PAYMENT_COMPLETED_TOPIC || "payment.completed";

export const PAYMENT_COMPLETED_DLQ_TOPIC =
  process.env.PAYMENT_COMPLETED_DLQ_TOPIC || "payment.completed.dlq";

export const KAFKA_PAYMENT_COMPLETED_GROUP_ID =
  process.env.KAFKA_PAYMENT_COMPLETED_INVOICE_GROUP_ID ||
  "invoice-service-payment-completed";

export const ENABLE_PAYMENT_COMPLETED_CONSUMER =
  process.env.ENABLE_PAYMENT_COMPLETED_CONSUMER !== "false";

/** Max process attempts per message (includes first try). */
export const PAYMENT_COMPLETED_MAX_PROCESS_ATTEMPTS = Number(
  process.env.PAYMENT_COMPLETED_MAX_PROCESS_ATTEMPTS ?? 5,
);

export const PAYMENT_COMPLETED_RETRY_BACKOFF_MS = Number(
  process.env.PAYMENT_COMPLETED_RETRY_BACKOFF_MS ?? 250,
);

/** Kafka consumer fetch tuning — smaller batches under load (backpressure). */
export const KAFKA_CONSUMER_MAX_BYTES = Number(
  process.env.KAFKA_CONSUMER_MAX_BYTES ?? 2_097_152,
);

export const KAFKA_CONSUMER_MAX_WAIT_MS = Number(
  process.env.KAFKA_CONSUMER_MAX_WAIT_MS ?? 150,
);

/** Partitions processed concurrently (keep low for CPU-heavy invoice writes). */
export const KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY = Number(
  process.env.KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY ?? 1,
);
