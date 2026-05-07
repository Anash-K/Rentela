import { randomUUID } from "crypto";
import { Prisma } from "../generated/prisma/index.js";
import prisma from "../libs/prisma.js";
import { PAYMENT_PROVIDER, PAYMENT_SKIP_AMOUNT_VERIFY } from "../config/env.js";
import { throwError } from "../utils/common.js";
import { verifyCapturedAgainstPayment } from "../utils/amount.js";
import { isUniqueViolation } from "../utils/prisma-errors.js";
import { createCheckout as createMockCheckout } from "../providers/mock.provider.js";
import { createCheckout as createRazorpayCheckout } from "../providers/razorpay.provider.js";

async function createStripeCheckoutSafe(input) {
  const mod = await import("../providers/stripe.provider.js");
  return mod.createCheckout(input);
}

function providerCreateCheckout(input) {
  const p = (PAYMENT_PROVIDER || "").toLowerCase();
  switch (p) {
    case "stripe":
      return createStripeCheckoutSafe(input);
    case "razorpay":
      return createRazorpayCheckout(input);
    case "mock":
    default:
      return createMockCheckout(input);
  }
}

async function findPaymentForWebhook(tx, { gatewayPaymentId, gatewayOrderId, paymentLinkId }) {
  const or = [];
  if (gatewayPaymentId) or.push({ gatewayPaymentId: String(gatewayPaymentId) });
  if (gatewayOrderId) or.push({ gatewayOrderId: String(gatewayOrderId) });
  if (paymentLinkId) {
    or.push({
      metadata: {
        path: ["paymentLinkId"],
        equals: String(paymentLinkId),
      },
    });
  }
  if (!or.length) return null;
  return tx.payment.findFirst({
    where: { OR: or },
    orderBy: { createdAt: "desc" },
  });
}

function normalizeBookingPaymentPhase(raw) {
  const allowed = new Set(["PREPAY", "SETTLEMENT", "EXTENSION"]);
  if (typeof raw === "string" && allowed.has(raw)) return raw;
  return "SETTLEMENT";
}

export async function createBookingPayment({
  userId,
  bookingId,
  amount,
  currency = "INR",
  method = "CARD",
  paymentPhase: paymentPhaseRaw,
}) {
  if (!userId || !bookingId) throwError("userId and bookingId required", 400);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throwError("Invalid amount", 400);

  const paymentPhase = normalizeBookingPaymentPhase(paymentPhaseRaw);
  const providerKey = PAYMENT_PROVIDER || "mock";

  const pending = await prisma.payment.findMany({
    where: {
      bookingId,
      type: "BOOKING",
      status: "PENDING",
      gatewayProvider: providerKey,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const phaseOf = (p) =>
    p.metadata?.paymentPhase != null ? String(p.metadata.paymentPhase) : "SETTLEMENT";

  const existing = pending.find((p) => phaseOf(p) === paymentPhase);
  if (existing) {
    return {
      payment: existing,
      checkout: existing.metadata?.checkout ?? null,
    };
  }

  let checkout;
  try {
    checkout = await providerCreateCheckout({
      amount: amt,
      currency,
      metadata: {
        bookingId,
        userId,
        paymentPhase,
        description: `Booking rental — ${bookingId} (${paymentPhase})`,
      },
    });
  } catch (e) {
    console.error("Payment provider checkout failed:", e.message);
    throwError(`Payment initiation failed: ${e.message}`, 502);
  }

  try {
    const payment = await prisma.payment.create({
      data: {
        userId,
        bookingId,
        type: "BOOKING",
        method,
        status: "PENDING",
        amount: amt,
        currency,
        gatewayProvider: checkout.provider ?? providerKey,
        gatewayOrderId: checkout.gatewayOrderId,
        gatewayPaymentId: checkout.gatewayPaymentId ?? null,
        gatewayResponse: checkout.raw ?? null,
        metadata: {
          paymentPhase,
          checkout: {
            paymentUrl: checkout.paymentUrl ?? null,
            publicKeyId: checkout.publicKeyId ?? null,
          },
          ...(checkout.paymentLinkId ? { paymentLinkId: checkout.paymentLinkId } : {}),
        },
      },
    });

    return {
      payment,
      checkout: {
        paymentUrl: checkout.paymentUrl,
        publicKeyId: checkout.publicKeyId ?? undefined,
        orderId: checkout.gatewayOrderId,
      },
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await prisma.payment.findMany({
        where: {
          bookingId,
          type: "BOOKING",
          status: "PENDING",
          gatewayProvider: providerKey,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const dup = again.find((p) => phaseOf(p) === paymentPhase);
      if (dup) {
        return {
          payment: dup,
          checkout: dup.metadata?.checkout ?? null,
        };
      }
    }
    throw e;
  }
}

/**
 * Idempotent capture: webhook dedupe row + row lock + amount/currency verify + SUCCESS +
 * ledger row for Kafka `payment.completed` (published post-commit — see webhook controller).
 */
export async function processWebhookPaymentCapture({
  provider,
  externalEventId,
  gatewayOrderId,
  gatewayPaymentId,
  paymentLinkId,
  verifiedAmountMinor,
  verifiedCurrency,
  gatewayResponse,
}) {
  if (!provider || !externalEventId) {
    throwError("provider and externalEventId required", 400);
  }

  const skipVerify =
    PAYMENT_SKIP_AMOUNT_VERIFY || (PAYMENT_PROVIDER || "").toLowerCase() === "mock";

  return prisma.$transaction(
    async (tx) => {
      const inserted = await tx.$queryRaw`
        INSERT INTO "WebhookEvent" ("id", "provider", "externalId", "status", "createdAt")
        VALUES (gen_random_uuid(), ${provider}, ${externalEventId}, ${"RECEIVED"}, NOW())
        ON CONFLICT ("provider", "externalId") DO NOTHING
        RETURNING "id"
      `;

      if (!Array.isArray(inserted) || inserted.length === 0) {
        return { duplicate: true };
      }

      const payment = await findPaymentForWebhook(tx, {
        gatewayPaymentId,
        gatewayOrderId,
        paymentLinkId,
      });

      if (!payment) {
        await tx.webhookEvent.updateMany({
          where: { provider, externalId: externalEventId },
          data: {
            status: "REJECTED_NO_PAYMENT",
            rejectionReason: "No matching Payment row for gateway ids",
          },
        });
        return { rejected: true, reason: "PAYMENT_NOT_FOUND" };
      }

      await tx.$executeRaw`
        SELECT 1 FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE
      `;

      const locked = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!locked) {
        return { rejected: true, reason: "PAYMENT_GONE" };
      }

      if (locked.status === "SUCCESS") {
        await tx.webhookEvent.updateMany({
          where: { provider, externalId: externalEventId },
          data: {
            status: "PROCESSED_DUPLICATE_DELIVERY",
            paymentId: locked.id,
            rejectionReason: "Payment already SUCCESS (late webhook replay)",
          },
        });
        return { duplicate: true, payment: locked };
      }

      if (locked.status !== "PENDING") {
        await tx.webhookEvent.updateMany({
          where: { provider, externalId: externalEventId },
          data: {
            status: "REJECTED_BAD_STATE",
            paymentId: locked.id,
            rejectionReason: `Payment status ${locked.status}`,
          },
        });
        return { rejected: true, reason: "INVALID_PAYMENT_STATE", payment: locked };
      }

      const gp = (locked.gatewayProvider || "").toLowerCase();
      const wp = provider.toLowerCase();
      if (gp && wp && gp !== wp) {
        await tx.payment.update({
          where: { id: locked.id },
          data: {
            status: "FAILED",
            failureReason: "WEBHOOK_PROVIDER_MISMATCH",
            gatewayResponse: gatewayResponse ?? locked.gatewayResponse,
          },
        });
        await tx.webhookEvent.updateMany({
          where: { provider, externalId: externalEventId },
          data: {
            status: "REJECTED_PROVIDER_MISMATCH",
            paymentId: locked.id,
            rejectionReason: `Stored gateway ${gp}, webhook ${wp}`,
          },
        });
        return { rejected: true, reason: "PROVIDER_MISMATCH" };
      }

      if (!skipVerify) {
        if (verifiedAmountMinor == null || verifiedCurrency == null || verifiedCurrency === "") {
          await tx.webhookEvent.updateMany({
            where: { provider, externalId: externalEventId },
            data: {
              status: "REJECTED_AMOUNT",
              paymentId: locked.id,
              rejectionReason: "Missing verifiedAmountMinor or verifiedCurrency after signature check",
            },
          });
          return { rejected: true, reason: "MISSING_CAPTURE_FIELDS" };
        }

        const v = verifyCapturedAgainstPayment(locked, verifiedAmountMinor, verifiedCurrency);
        if (!v.ok) {
          await tx.payment.update({
            where: { id: locked.id },
            data: {
              status: "FAILED",
              failureReason: v.reason,
              gatewayResponse: gatewayResponse ?? locked.gatewayResponse,
            },
          });
          await tx.webhookEvent.updateMany({
            where: { provider, externalId: externalEventId },
            data: {
              status: "REJECTED_AMOUNT",
              paymentId: locked.id,
              rejectionReason: JSON.stringify(v.detail || { reason: v.reason }),
            },
          });
          return { rejected: true, reason: v.reason, detail: v.detail };
        }
      }

      const gpId =
        gatewayPaymentId != null && gatewayPaymentId !== ""
          ? String(gatewayPaymentId)
          : locked.gatewayPaymentId;

      const updated = await tx.payment.update({
        where: { id: locked.id },
        data: {
          status: "SUCCESS",
          paidAt: new Date(),
          capturedAt: new Date(),
          gatewayPaymentId: gpId,
          gatewayOrderId: gatewayOrderId ?? locked.gatewayOrderId,
          gatewayResponse: gatewayResponse ?? locked.gatewayResponse,
          failureReason: null,
        },
      });

      await tx.webhookEvent.updateMany({
        where: { provider, externalId: externalEventId },
        data: {
          status: "PROCESSED",
          paymentId: updated.id,
        },
      });

      if (updated.bookingId) {
        await tx.paymentEmittedEvent.create({
          data: {
            paymentId: updated.id,
            correlationId: randomUUID(),
          },
        });
      }

      return { payment: updated };
    },
    {
      maxWait: 8000,
      timeout: 25000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

export async function getPayment(id) {
  return prisma.payment.findUnique({ where: { id } });
}
