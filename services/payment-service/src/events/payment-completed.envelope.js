/** Contract version for Kafka topic `payment.completed` — relay worker is the sole publisher. */
export const PAYMENT_COMPLETED_SCHEMA_VERSION = 1;

/**
 * @param {object} input
 * @param {string} input.correlationId
 * @param {object} input.payment — Prisma Payment row (SUCCESS)
 * @param {object|null} input.bill — booking-service GET /:id/bill → data.bill or null if fetch failed
 * @param {string} [input.billFetchWarning]
 */
export function buildPaymentCompletedEnvelope({
  correlationId,
  payment,
  bill,
  billFetchWarning,
}) {
  const totalAmount =
    bill?.totalAmount != null ? Number(bill.totalAmount) : Number(payment.amount);

  return {
    schemaVersion: PAYMENT_COMPLETED_SCHEMA_VERSION,
    correlationId,
    eventId: correlationId,
    paymentId: payment.id,
    bookingId: payment.bookingId,
    userId: payment.userId,
    amount: Number(payment.amount),
    currency: payment.currency ?? "INR",
    totalAmount,
    breakdown: bill?.breakdown ?? null,
    billCurrency: bill?.currency ?? payment.currency ?? "INR",
    meta: {
      source: "payment-service-relay",
      billFetched: Boolean(bill?.breakdown),
      ...(billFetchWarning ? { billFetchWarning } : {}),
    },
  };
}
