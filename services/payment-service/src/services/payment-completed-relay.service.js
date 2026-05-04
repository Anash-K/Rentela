/**
 * **Only path that publishes `payment.completed`** (Kafka): ledger row → fetch bill from booking → versioned envelope → producer.
 * Webhook handlers never send Kafka — survives process crashes before relay runs.
 */
import axios from "axios";
import pino from "pino";

import prisma from "../libs/prisma.js";
import {
  BOOKING_SERVICE_URL,
  RELAY_BILL_FETCH_RETRIES,
  RELAY_BILL_FETCH_TIMEOUT_MS,
  RELAY_BILL_RETRY_BASE_MS,
} from "../config/env.js";
import { buildPaymentCompletedEnvelope } from "../events/payment-completed.envelope.js";
import { publishPaymentCompletedEnvelope } from "../kafka/producer.js";
import { publishBookingNotify } from "../utils/bookingNotify.js";

const logger = pino({ name: "payment-completed-relay" });

async function fetchBillWithRetries(bookingId, correlationId) {
  let lastErr;
  for (let attempt = 1; attempt <= RELAY_BILL_FETCH_RETRIES; attempt++) {
    try {
      const res = await axios.get(`${BOOKING_SERVICE_URL}/${bookingId}/bill`, {
        timeout: RELAY_BILL_FETCH_TIMEOUT_MS,
      });
      const bill = res.data?.data?.bill;
      logger.info(
        {
          correlationId,
          bookingId,
          status: "bill_fetch_ok",
          attempt,
        },
        "Relay fetched booking bill for envelope",
      );
      return { bill, warning: null };
    } catch (err) {
      lastErr = err;
      logger.warn(
        {
          correlationId,
          bookingId,
          status: "bill_fetch_retry",
          attempt,
          err: err.message,
        },
        "Relay bill fetch failed — retrying",
      );
      if (attempt < RELAY_BILL_FETCH_RETRIES) {
        await new Promise((r) =>
          setTimeout(r, RELAY_BILL_RETRY_BASE_MS * attempt),
        );
      }
    }
  }
  logger.error(
    {
      correlationId,
      bookingId,
      status: "bill_fetch_failed",
      err: lastErr?.message,
    },
    "Relay bill fetch exhausted — publishing envelope with payment totals only",
  );
  return { bill: null, warning: lastErr?.message ?? "BILL_FETCH_FAILED" };
}

export async function relayPaymentEmittedEvent(paymentId) {
  const ledger = await prisma.paymentEmittedEvent.findUnique({
    where: { paymentId },
    include: { payment: true },
  });

  if (!ledger || ledger.emittedAt != null) {
    return { skipped: true };
  }

  const pay = ledger.payment;
  if (!pay || pay.status !== "SUCCESS" || !pay.bookingId) {
    return { skipped: true };
  }

  const correlationId = ledger.correlationId;
  const baseLog = {
    correlationId,
    eventId: correlationId,
    paymentId: pay.id,
    bookingId: pay.bookingId,
    status: "relay_start",
  };
  logger.info(baseLog, "Relay processing ledger row");

  const { bill, warning } = await fetchBillWithRetries(pay.bookingId, correlationId);

  const envelope = buildPaymentCompletedEnvelope({
    correlationId,
    payment: pay,
    bill,
    billFetchWarning: warning,
  });

  try {
    await publishPaymentCompletedEnvelope(envelope);

    await prisma.paymentEmittedEvent.update({
      where: { paymentId },
      data: { emittedAt: new Date(), lastEmitError: null },
    });

    logger.info(
      {
        ...baseLog,
        status: "kafka_produced",
        topic: "payment.completed",
      },
      "payment.completed produced by relay worker",
    );

    await publishBookingNotify({
      eventType: "FINAL_BILL_READY",
      userId: pay.userId,
      bookingId: pay.bookingId,
      paymentId: pay.id,
      correlationId,
      totalAmount: envelope.totalAmount,
      currency: envelope.billCurrency ?? envelope.currency,
      message: "Your final bill is ready with this payment",
      dedupeKey: `booking:${pay.bookingId}:final_bill:${pay.id}`,
    });

    return { ok: true };
  } catch (err) {
    await prisma.paymentEmittedEvent.update({
      where: { paymentId },
      data: {
        lastEmitError: String(err?.message || err),
        emitAttempts: { increment: 1 },
      },
    });
    logger.error(
      {
        ...baseLog,
        status: "kafka_produce_failed",
        err: err.message,
      },
      "Kafka publish failed — will retry via relay poll",
    );
    throw err;
  }
}
