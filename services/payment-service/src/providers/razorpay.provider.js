import axios from "axios";

const amountToPaise = (amount) => Math.round(Number(amount) * 100);

function verifyEnv() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
  return { keyId, keySecret };
}

/**
 * Razorpay Payment Link (server-hosted checkout URL — good for redirects without frontend SDK).
 * https://razorpay.com/docs/api/payment-links/
 */
export async function createCheckout({ amount, currency = "INR", metadata }) {
  const { keyId, keySecret } = verifyEnv();
  const receipt = `${metadata.bookingId}`.slice(0, 40);

  const body = {
    amount: amountToPaise(amount),
    currency,
    reference_id: receipt,
    accept_partial: false,
    description: metadata.description || `Booking ${metadata.bookingId}`,
    reminder_enable: true,
    notify: {
      sms: Boolean(process.env.RAZORPAY_NOTIFY_SMS),
      email: Boolean(process.env.RAZORPAY_NOTIFY_EMAIL),
    },
    notes: metadata,
  };
  if (process.env.RAZORPAY_CALLBACK_URL) {
    body.callback_url = process.env.RAZORPAY_CALLBACK_URL;
    body.callback_method = "get";
  }

  const { data } = await axios.post(
    "https://api.razorpay.com/v1/payment_links",
    body,
    {
      auth: { username: keyId, password: keySecret },
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    },
  );

  return {
    provider: "razorpay",
    gatewayOrderId: data?.order_id ?? data?.id,
    gatewayPaymentId: null,
    paymentUrl: data?.short_url,
    raw: data,
    publicKeyId: keyId,
    paymentLinkId: data?.id,
  };
}
