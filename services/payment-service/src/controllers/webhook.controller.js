import crypto from "crypto";
import {
  RAZORPAY_WEBHOOK_SECRET,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} from "../config/env.js";
import * as paymentService from "../services/payment.service.js";
import { razorpayExternalEventId } from "../utils/webhook-ids.js";

function verifyRazorpayHmac(secret, signature, payloadBuffer) {
  if (!signature || !payloadBuffer?.length || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(payloadBuffer).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendWebhookResult(res, result) {
  if (result?.duplicate) {
    return res.json({ received: true, duplicate: true });
  }
  if (result?.rejected) {
    return res.status(200).json({
      received: true,
      processed: false,
      reason: result.reason,
      detail: result.detail ?? null,
    });
  }
  return res.json({ received: true, processed: true });
}

export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const payloadBuf = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body || {}));

  if (!RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).send("Webhook secret not configured");
  }

  const ok = verifyRazorpayHmac(RAZORPAY_WEBHOOK_SECRET, signature, payloadBuf);
  if (!ok) return res.status(401).send("Invalid signature");

  let event;
  try {
    event = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON body");
  }

  const externalEventId = razorpayExternalEventId(event);
  const paymentEntity = event.payload?.payment?.entity;
  const paymentLinkEntityId =
    event.payload?.payment_link?.entity?.id ?? event.payload?.payment_link?.entity?.order_id ?? null;

  try {
    if (event?.event === "payment.captured" || event?.event === "payment_link.paid") {
      const p = paymentEntity;
      const result = await paymentService.processWebhookPaymentCapture({
        provider: "razorpay",
        externalEventId,
        gatewayPaymentId: p?.id ?? null,
        gatewayOrderId: p?.order_id ?? null,
        paymentLinkId: paymentLinkEntityId,
        verifiedAmountMinor: p?.amount != null ? Number(p.amount) : null,
        verifiedCurrency: p?.currency ?? null,
        gatewayResponse: event,
      });
      return sendWebhookResult(res, result);
    }
  } catch (e) {
    console.error("Razorpay webhook handler error:", e.message);
    return res.status(500).json({ success: false });
  }

  return res.status(200).json({ received: true, ignored: true });
};

export const stripeWebhook = async (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return res.status(503).send("Stripe webhook/API keys not configured");
  }

  const sig = req.headers["stripe-signature"];
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, STRIPE_WEBHOOK_SECRET);
    } catch {
      return res.status(400).send("Webhook signature verification failed");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" || session.mode === "setup") {
        return res.status(200).json({ received: true, ignored: true, reason: "NOT_PAYMENT_MODE" });
      }
      if (session.amount_total == null) {
        return res.status(200).json({ received: true, ignored: true, reason: "NO_AMOUNT_TOTAL" });
      }
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const result = await paymentService.processWebhookPaymentCapture({
        provider: "stripe",
        externalEventId: event.id,
        gatewayOrderId: session.id,
        gatewayPaymentId: pi,
        paymentLinkId: null,
        verifiedAmountMinor: session.amount_total,
        verifiedCurrency: session.currency,
        gatewayResponse: session,
      });
      return sendWebhookResult(res, result);
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const result = await paymentService.processWebhookPaymentCapture({
        provider: "stripe",
        externalEventId: event.id,
        gatewayOrderId: null,
        gatewayPaymentId: pi.id,
        paymentLinkId: null,
        verifiedAmountMinor:
          pi.amount_received != null ? Number(pi.amount_received) : Number(pi.amount ?? 0),
        verifiedCurrency: pi.currency,
        gatewayResponse: pi,
      });
      return sendWebhookResult(res, result);
    }

    return res.status(200).json({ received: true, ignored: true, type: event.type });
  } catch (e) {
    console.error("Stripe webhook error:", e.message);
    return res.status(500).json({ success: false });
  }
};
