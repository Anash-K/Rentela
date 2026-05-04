/**
 * Stripe Checkout Session — returns hosted payment page URL.
 */
export async function createCheckout({ amount, currency = "INR", metadata }) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required");

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secretKey);

  const unitAmountMinor = currency.toLowerCase() === "inr"
    ? Math.round(Number(amount) * 100)
    : Math.round(Number(amount) * 100);

  const meta = Object.fromEntries(
    Object.entries(metadata || {}).map(([k, v]) => [k, String(v ?? "")]),
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: unitAmountMinor,
          product_data: {
            name: metadata.description || `Booking ${metadata.bookingId}`,
            metadata: meta,
          },
        },
        quantity: 1,
      },
    ],
    success_url: process.env.STRIPE_SUCCESS_URL || "https://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: process.env.STRIPE_CANCEL_URL || "https://localhost:3000/checkout/cancel",
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
    },
  });

  return {
    provider: "stripe",
    gatewayOrderId: session.id,
    gatewayPaymentId: session.payment_intent ?? null,
    paymentUrl: session.url,
    raw: session,
  };
}
