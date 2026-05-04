import crypto from "crypto";

export function createCheckout({ amount, currency, metadata }) {
  const id = crypto.randomUUID();
  const orderId = `mock_order_${crypto.randomUUID()}`;
  const paymentUrl = `http://localhost:3000/mock-pay?paymentId=${id}`;

  return {
    provider: "mock",
    gatewayOrderId: orderId,
    gatewayPaymentId: null,
    paymentUrl,
    raw: { amount, currency, metadata },
  };
}

export function verifyWebhook(_req) {
  return { ok: true };
}
