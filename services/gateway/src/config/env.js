import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 5000;

export const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:5003";

export const VEHICLE_SERVICE_URL =
  process.env.VEHICLE_SERVICE_URL || "http://localhost:5010";

export const BOOKING_SERVICE_URL =
  process.env.BOOKING_SERVICE_URL || "http://localhost:5004";

export const TELEMETRY_SERVICE_URL =
  process.env.TELEMETRY_SERVICE_URL || "http://localhost:5020";

export const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:5007";

export const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5006";

export const INVOICE_SERVICE_URL =
  process.env.INVOICE_SERVICE_URL || "http://localhost:5012";

export const PRICING_SERVICE_URL =
  process.env.PRICING_SERVICE_URL || "http://localhost:5015";
