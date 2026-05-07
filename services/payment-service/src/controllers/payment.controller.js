import { randomUUID } from "crypto";

import { ENABLE_DEV_PAYMENT_SIMULATION } from "../config/env.js";
import * as paymentService from "../services/payment.service.js";
import { sendSuccess, throwError } from "../utils/common.js";

export const createBookingPayment = async (req, res, next) => {
  try {
    const { userId, bookingId, amount, currency, method, paymentPhase } = req.body;
    const result = await paymentService.createBookingPayment({
      userId,
      bookingId,
      amount,
      currency,
      method,
      paymentPhase,
    });
    return sendSuccess(res, result, "Payment initiated", 201);
  } catch (err) {
    next(err);
  }
};

export const getPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.getPayment(req.params.id);
    return sendSuccess(res, { payment });
  } catch (err) {
    next(err);
  }
};

/** Local / CI only: completes the mock payment pipeline without real webhooks. */
export const simulateDevCapture = async (req, res, next) => {
  try {
    if (!ENABLE_DEV_PAYMENT_SIMULATION) {
      return res.status(403).json({
        success: false,
        message:
          "Dev simulation disabled — use PAYMENT_PROVIDER=mock, or set ENABLE_DEV_PAYMENT_SIMULATION=true",
      });
    }

    const payment = await paymentService.getPayment(req.params.id);
    if (!payment) throwError("Payment not found", 404);
    if ((payment.gatewayProvider || "").toLowerCase() !== "mock") {
      throwError("Only mock provider payments can be simulated", 400);
    }
    if (!payment.gatewayOrderId) throwError("Payment missing gatewayOrderId", 400);

    const result = await paymentService.processWebhookPaymentCapture({
      provider: "mock",
      externalEventId: randomUUID(),
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: `mock_capture_${payment.id}`,
      paymentLinkId: null,
      verifiedAmountMinor: null,
      verifiedCurrency: null,
      gatewayResponse: { simulated: true, source: "dev-simulate-capture" },
    });

    return sendSuccess(res, { capture: result }, "Simulated webhook capture", 200);
  } catch (err) {
    next(err);
  }
};

