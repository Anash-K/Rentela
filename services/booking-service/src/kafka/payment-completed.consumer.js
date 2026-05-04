import pino from "pino";
import { ZodError } from "zod";

import { kafka } from "./client.js";
import { sendPaymentCompletedToDlq } from "./dlq.js";
import {
  ENABLE_PAYMENT_COMPLETED_CONSUMER,
  KAFKA_CONSUMER_MAX_BYTES,
  KAFKA_CONSUMER_MAX_WAIT_MS,
  KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY,
  KAFKA_PAYMENT_COMPLETED_GROUP_ID,
  PAYMENT_COMPLETED_DLQ_TOPIC,
  PAYMENT_COMPLETED_MAX_PROCESS_ATTEMPTS,
  PAYMENT_COMPLETED_RETRY_BACKOFF_MS,
  PAYMENT_COMPLETED_TOPIC,
} from "../config/env.js";
import { processPaymentCompletedMessage } from "../services/payment-completed.processor.js";

const logger = pino({ name: "booking-kafka-consumer" });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (!err) return false;
  if (err.code === "NON_RETRYABLE") return false;
  if (err instanceof ZodError) return false;
  return true;
}

function tryParseCorrelation(raw) {
  try {
    const j = JSON.parse(raw);
    return j.correlationId ?? j.eventId ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function processOneMessage(message, heartbeat) {
  const raw = message.value?.toString("utf8");
  if (!raw) {
    logger.warn({ partition: message.partition }, "Empty payment.completed body");
    return;
  }

  const correlationId = tryParseCorrelation(raw);
  const log = logger.child({
    correlationId,
    partition: message.partition,
    offset: message.offset,
    consumer: "booking-service",
  });

  for (let attempt = 1; attempt <= PAYMENT_COMPLETED_MAX_PROCESS_ATTEMPTS; attempt++) {
    try {
      await processPaymentCompletedMessage(raw);
      log.info(
        {
          attempt,
          status: "event_consumed",
          topic: PAYMENT_COMPLETED_TOPIC,
        },
        "payment.completed processed",
      );
      await heartbeat();
      return;
    } catch (err) {
      log.warn(
        {
          attempt,
          status: "consume_attempt_failed",
          err: err.message,
          retryable: isRetryable(err),
        },
        "booking consume attempt failed",
      );

      const terminal = !isRetryable(err) || attempt >= PAYMENT_COMPLETED_MAX_PROCESS_ATTEMPTS;

      if (terminal) {
        let parsedPaymentId;
        try {
          parsedPaymentId = JSON.parse(raw).paymentId;
        } catch {
          parsedPaymentId = undefined;
        }

        await sendPaymentCompletedToDlq({
          consumer: "booking-service",
          correlationId,
          paymentId: parsedPaymentId,
          error: err.message,
          rawMessage: raw,
          partition: message.partition,
          offset: message.offset,
          originalTopic: PAYMENT_COMPLETED_TOPIC,
          dlqTopic: PAYMENT_COMPLETED_DLQ_TOPIC,
        });
        await heartbeat();
        return;
      }

      await sleep(PAYMENT_COMPLETED_RETRY_BACKOFF_MS * attempt);
    }
  }
}

export async function startPaymentCompletedConsumer() {
  if (!ENABLE_PAYMENT_COMPLETED_CONSUMER) {
    logger.info({ status: "consumer_disabled" }, "Kafka payment.completed consumer disabled");
    return async () => {};
  }

  const consumer = kafka.consumer({
    groupId: KAFKA_PAYMENT_COMPLETED_GROUP_ID,
    sessionTimeout: 60000,
    maxBytes: KAFKA_CONSUMER_MAX_BYTES,
    maxWaitTimeInMs: KAFKA_CONSUMER_MAX_WAIT_MS,
  });

  await consumer.connect();
  await consumer.subscribe({ topic: PAYMENT_COMPLETED_TOPIC, fromBeginning: false });

  void consumer.run({
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY,
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break;
        await processOneMessage(message, heartbeat);
        resolveOffset(message.offset);
      }
      await heartbeat();
    },
  });

  logger.info(
    {
      status: "consumer_started",
      groupId: KAFKA_PAYMENT_COMPLETED_GROUP_ID,
      topic: PAYMENT_COMPLETED_TOPIC,
      partitionsConcurrency: KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY,
      dlqTopic: PAYMENT_COMPLETED_DLQ_TOPIC,
    },
    "booking-service subscribed to payment.completed",
  );

  return async () => {
    await consumer.disconnect();
  };
}
