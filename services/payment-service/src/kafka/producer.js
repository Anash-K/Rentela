import { Kafka } from "kafkajs";
import {
  KAFKA_CLIENT_ID,
  KAFKA_BROKERS,
  PAYMENT_COMPLETED_TOPIC,
  PAYMENT_COMPLETED_PARTITION_KEY,
} from "../config/env.js";

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
});

export const producer = kafka.producer({
  /** Idempotent producer reduces duplicate publishes on retries (broker dedupe window). */
  idempotent: true,
});

let connectPromise = null;

export async function ensureProducerConnected() {
  if (!connectPromise) {
    connectPromise = producer.connect().catch((e) => {
      connectPromise = null;
      throw e;
    });
  }
  await connectPromise;
}

export async function disconnectProducer() {
  try {
    await producer.disconnect();
  } catch {
    /** ignore */
  }
  connectPromise = null;
}

function partitionKeyFromEnvelope(envelope) {
  if (PAYMENT_COMPLETED_PARTITION_KEY === "payment") {
    return envelope.paymentId;
  }
  /** Default: ordering per booking (recommended). */
  return envelope.bookingId;
}

/**
 * Sole Kafka publish for payment.success fan-out. Called **only** from payment-completed relay worker.
 */
export async function publishPaymentCompletedEnvelope(envelope) {
  await ensureProducerConnected();
  const key = partitionKeyFromEnvelope(envelope);
  const value = JSON.stringify(envelope);

  await producer.send({
    topic: PAYMENT_COMPLETED_TOPIC,
    acks: -1,
    messages: [
      {
        key,
        value,
        headers: {
          schemaVersion: Buffer.from(String(envelope.schemaVersion)),
          correlationId: Buffer.from(envelope.correlationId),
          paymentId: Buffer.from(envelope.paymentId),
          bookingId: Buffer.from(envelope.bookingId),
        },
      },
    ],
  });

  return envelope;
}
