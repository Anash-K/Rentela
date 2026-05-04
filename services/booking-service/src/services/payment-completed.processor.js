import pino from "pino";

import * as bookingService from "./booking.service.js";
import { paymentCompletedEnvelopeSchema } from "../schemas/payment-completed-envelope.schema.js";

const logger = pino({ name: "booking-payment-completed" });

export async function processPaymentCompletedMessage(rawPayload) {
  let parsed;
  try {
    parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch (e) {
    const err = new Error(`JSON_PARSE_FAILED: ${e.message}`);
    err.code = "NON_RETRYABLE";
    throw err;
  }

  const envelope = paymentCompletedEnvelopeSchema.parse(parsed);
  const log = logger.child({
    correlationId: envelope.correlationId,
    eventId: envelope.eventId ?? envelope.correlationId,
    paymentId: envelope.paymentId,
    bookingId: envelope.bookingId,
  });

  log.info({ status: "apply_payment_completed" }, "Applying payment.completed envelope");

  await bookingService.updateBookingPaymentStatus(envelope.bookingId, {
    paymentStatus: "PAID",
    paymentId: envelope.paymentId,
  });

  log.info({ status: "booking_payment_status_updated" }, "Booking marked PAID from payment.completed");
}
