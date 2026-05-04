import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load payment-service/.env (not cwd) so monorepo `pnpm dev` from repo root still works.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const PORT = Number(process.env.PORT || 5006);

/** Used only when `ENABLE_LEGACY_OUTBOX_WORKER=true` (HTTP fallback). */
export const BOOKING_SERVICE_URL =
  process.env.BOOKING_SERVICE_URL || "http://localhost:5004";

/** Comma-separated broker list — same convention as tracking-worker (`KAFKA_BROKERS=localhost:9092`). */
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",").map((s) => s.trim()).filter(Boolean);

export const KAFKA_CLIENT_ID =
  process.env.KAFKA_PAYMENT_CLIENT_ID || "payment-service";

export const PAYMENT_COMPLETED_TOPIC =
  process.env.PAYMENT_COMPLETED_TOPIC || "payment.completed";

/** Kafka message key: `booking` (default, ordering per booking) or `payment` (per payment). */
export const PAYMENT_COMPLETED_PARTITION_KEY =
  process.env.PAYMENT_COMPLETED_PARTITION_KEY === "payment" ? "payment" : "booking";

export const RELAY_BILL_FETCH_RETRIES = Number(
  process.env.RELAY_BILL_FETCH_RETRIES ?? 4,
);

export const RELAY_BILL_FETCH_TIMEOUT_MS = Number(
  process.env.RELAY_BILL_FETCH_TIMEOUT_MS ?? 12_000,
);

export const RELAY_BILL_RETRY_BASE_MS = Number(
  process.env.RELAY_BILL_RETRY_BASE_MS ?? 400,
);

/**
 * Low-frequency DB scan for undelivered `payment.completed` messages (Kafka down at commit time).
 * **Replaces** the old high-frequency PaymentOutbox HTTP worker for booking/invoice,
 * which is now driven by Kafka consumers downstream.
 */
export const EMITTED_EVENTS_POLL_MS = Number(
  process.env.EMITTED_EVENTS_POLL_MS ?? 30_000,
);

export const EMITTED_EVENTS_BATCH_SIZE = Number(
  process.env.EMITTED_EVENTS_BATCH_SIZE ?? 50,
);

/**
 * Legacy PaymentOutbox (HTTP side-effects) polling — **disabled by default**.
 * Use only if you re-enqueue rows manually (`BOOKING_PAID` / `INVOICE` kinds).
 * Normal path: Kafka `payment.completed` + `PaymentEmittedEvent` retries (`EMITTED_EVENTS_POLL_MS`).
 */
export const ENABLE_LEGACY_OUTBOX_WORKER =
  process.env.ENABLE_LEGACY_OUTBOX_WORKER === "true";

export const LEGACY_OUTBOX_POLL_MS = Number(
  process.env.LEGACY_OUTBOX_POLL_MS ?? 120_000,
);

export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || "mock"; // mock|razorpay|stripe

/**
 * `POST /internal/dev/simulate-capture/:id` (mock provider only).
 * - Explicit `ENABLE_DEV_PAYMENT_SIMULATION=true|false` wins.
 * - If unset, **enabled when PAYMENT_PROVIDER is mock** so local E2E does not need extra env.
 */
const devSimEnv = process.env.ENABLE_DEV_PAYMENT_SIMULATION;
export const ENABLE_DEV_PAYMENT_SIMULATION =
  devSimEnv === "true" ||
  (devSimEnv !== "false" && PAYMENT_PROVIDER === "mock");

export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

/** Extra slack when comparing DB amount vs gateway capture (minor units). Default 0. */
export const PAYMENT_AMOUNT_TOLERANCE_MINOR = Number(
  process.env.PAYMENT_AMOUNT_TOLERANCE_MINOR ?? 0,
);

/** Comma-separated ISO codes that do not use cents (Stripe/Razorpay minor unit = 1 unit). */
export const ZERO_DECIMAL_CURRENCIES =
  process.env.ZERO_DECIMAL_CURRENCIES || "JPY,KRW,VND";

export const LEGACY_OUTBOX_BATCH_SIZE = Number(
  process.env.LEGACY_OUTBOX_BATCH_SIZE ?? 25,
);

export const LEGACY_OUTBOX_MAX_ATTEMPTS = Number(
  process.env.LEGACY_OUTBOX_MAX_ATTEMPTS ?? 8,
);

export const LEGACY_OUTBOX_BASE_BACKOFF_MS = Number(
  process.env.LEGACY_OUTBOX_BASE_BACKOFF_MS ?? 5000,
);

/** Skip strict amount/currency checks (local integration tests only). */
export const PAYMENT_SKIP_AMOUNT_VERIFY =
  process.env.PAYMENT_SKIP_AMOUNT_VERIFY === "true";
