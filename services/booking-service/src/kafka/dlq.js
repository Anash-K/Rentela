import pino from "pino";

import { kafka } from "./client.js";
import { PAYMENT_COMPLETED_DLQ_TOPIC } from "../config/env.js";

const logger = pino({ name: "booking-dlq" });

let producer = null;

export async function sendPaymentCompletedToDlq(record) {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }

  const key = String(record.correlationId || record.paymentId || "unknown");

  await producer.send({
    topic: PAYMENT_COMPLETED_DLQ_TOPIC,
    messages: [
      {
        key,
        value: JSON.stringify({
          ...record,
          dlqProducedAt: new Date().toISOString(),
        }),
      },
    ],
  });

  logger.error(
    {
      ALERT: true,
      reason: "payment_completed_moved_to_dlq",
      correlationId: record.correlationId,
      paymentId: record.paymentId,
    },
    "ALERT: message sent to payment.completed.dlq — manual replay may be required",
  );
}

export async function disconnectDlqProducer() {
  if (producer) {
    try {
      await producer.disconnect();
    } catch {
      /** */
    }
    producer = null;
  }
}
