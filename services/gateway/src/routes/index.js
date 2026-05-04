import express from "express";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  AUTH_SERVICE_URL,
  VEHICLE_SERVICE_URL,
  BOOKING_SERVICE_URL,
  TELEMETRY_SERVICE_URL,
  NOTIFICATION_SERVICE_URL,
  PAYMENT_SERVICE_URL,
  INVOICE_SERVICE_URL,
  PRICING_SERVICE_URL,
} from "../config/env.js";

const router = express.Router();

const limits = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(limits);

router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "gateway",
    requestId: req.requestId,
  });
});

function createServiceProxy(target, serviceName, prefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^${prefix}`]: "" },
    timeout: 5000,
    proxyTimeout: 5000,
    xfwd: true,

    on: {
      proxyReq: (proxyReq, req) => {
        if (req.requestId) {
          proxyReq.setHeader("x-request-id", req.requestId);
        }

        if (req.user?.id) {
          proxyReq.setHeader("x-user-id", req.user.id);
        }

        if (req.body && Object.keys(req.body).length) {
          const bodyData = JSON.stringify(req.body);

          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },

      error: (err, req, res) => {
        req.log?.error(
          {
            err: err.message,
            target: serviceName,
            requestId: req.requestId,
          },
          "Proxy error",
        );

        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            requestId: req.requestId,
            message: `${serviceName} unavailable`,
          });
        }
      },
    },
  });
}

router.use(
  "/auth",
  createServiceProxy(AUTH_SERVICE_URL, "auth-service", "/auth"),
);

router.use(
  "/vehicles",
  createServiceProxy(VEHICLE_SERVICE_URL, "vehicle-service", "/vehicles"),
);

router.use(
  "/bookings",
  createServiceProxy(BOOKING_SERVICE_URL, "booking-service", "/bookings"),
);

router.use(
  "/telemetry",
  createServiceProxy(
    TELEMETRY_SERVICE_URL,
    "telemetry-service",
    "/telemetry",
  ),
);

router.use(
  "/notifications",
  createServiceProxy(
    NOTIFICATION_SERVICE_URL,
    "notification-service",
    "/notifications",
  ),
);

router.use(
  "/payments",
  createServiceProxy(PAYMENT_SERVICE_URL, "payment-service", "/payments"),
);

router.use(
  "/invoices",
  createServiceProxy(INVOICE_SERVICE_URL, "invoice-service", "/invoices"),
);

router.use(
  "/pricing",
  createServiceProxy(PRICING_SERVICE_URL, "pricing-service", "/pricing"),
);

router.use((req, res) => {
  res.status(404).json({
    success: false,
    requestId: req.requestId,
    message: "Route not found",
  });
});

export default router;
