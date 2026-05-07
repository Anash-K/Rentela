import pino from "pino";

import prisma from "../libs/prisma.js";
import { paymentCompletedEnvelopeSchema } from "../schemas/payment-completed-envelope.schema.js";
import { upsertPaidInvoiceFromPayment } from "./invoice.service.js";
import { publishBookingNotify } from "../utils/bookingNotify.js";

const logger = pino({ name: "invoice-processor" });

function childFromEnvelope(env) {
  return logger.child({
    correlationId: env.correlationId,
    eventId: env.eventId ?? env.correlationId,
    paymentId: env.paymentId,
    bookingId: env.bookingId,
  });
}

/**
 * `payment.completed` v1 — full bill payload in envelope (no booking HTTP from invoice).
 */
export async function processPaymentCompletedMessage(rawPayload) {
  let parsed;
  try {
    parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch (e) {
    logger.error({ err: e.message, status: "parse_failed" }, "Invalid JSON for payment.completed");
    const err = new Error(`JSON_PARSE_FAILED: ${e.message}`);
    err.code = "NON_RETRYABLE";
    throw err;
  }

  const envelope = paymentCompletedEnvelopeSchema.parse(parsed);
  const log = childFromEnvelope(envelope);

  const existing = await prisma.invoice.findFirst({
    where: { paymentId: envelope.paymentId },
    select: { id: true },
  });
  if (existing) {
    log.info({ status: "invoice_exists", invoiceId: existing.id }, "Idempotent skip — invoice already present");
    return existing;
  }

  const phase = envelope.meta?.paymentPhase ?? "SETTLEMENT";

  const invoice = await upsertPaidInvoiceFromPayment({
    userId: envelope.userId,
    bookingId: envelope.bookingId,
    paymentId: envelope.paymentId,
    totalAmount: envelope.totalAmount,
    currency: envelope.billCurrency ?? envelope.currency,
    breakdown: envelope.breakdown ?? null,
    billingName: "Customer",
    paymentPhase: phase,
    paymentAmount: envelope.amount,
    billTotalAmount: envelope.totalAmount,
    settlementSnapshot: envelope.meta?.settlement ?? null,
  });

  log.info(
    { status: "invoice_upserted", invoiceId: invoice.id, phase },
    "Invoice created from payment.completed envelope",
  );

  const msg =
    phase === "PREPAY"
      ? "Your prepayment receipt is ready"
      : phase === "EXTENSION"
        ? "Your extension payment receipt is ready"
        : "Your trip settlement invoice is ready";

  await publishBookingNotify({
    eventType: "INVOICE_GENERATED",
    userId: envelope.userId,
    bookingId: envelope.bookingId,
    paymentId: envelope.paymentId,
    invoiceId: invoice.id,
    totalAmount: envelope.amount,
    billTotal: envelope.totalAmount,
    paymentPhase: phase,
    currency: envelope.billCurrency ?? envelope.currency,
    correlationId: envelope.correlationId,
    message: msg,
    dedupeKey: `invoice:${invoice.id}:generated`,
  });

  return invoice;
}
