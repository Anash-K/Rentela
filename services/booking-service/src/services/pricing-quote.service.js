import axios from "axios";

import { PRICING_SERVICE_URL, VEHICLE_SERVICE_URL } from "../config/pricing.env.js";

/**
 * Loads vehicle attributes + calls pricing-service for an immutable quote snapshot.
 */
export async function fetchAutoPricingQuote({
  vehicleId,
  startAt,
  endAt,
  estimatedDistanceKm = 0,
}) {
  try {
  const baseVehicleUrl = VEHICLE_SERVICE_URL.replace(/\/$/, "");
  const basePricingUrl = PRICING_SERVICE_URL.replace(/\/$/, "");

  const vehRes = await axios.get(`${baseVehicleUrl}/${vehicleId}`, {
    timeout: Number(process.env.PRICING_HTTP_TIMEOUT_MS ?? 8000),
    validateStatus: (s) => s < 500,
  });

  if (vehRes.status >= 400) {
    const err = new Error(
      vehRes.data?.message || `Vehicle fetch failed: ${vehRes.status}`,
    );
    err.statusCode = vehRes.status;
    throw err;
  }

  const vehicle =
    vehRes.data?.data?.vehicle ??
    vehRes.data?.data ??
    vehRes.data?.vehicle ??
    vehRes.data;

  if (!vehicle?.id) {
    const err = new Error("Invalid vehicle response");
    err.statusCode = 502;
    throw err;
  }

  const quoteRes = await axios.post(
    `${basePricingUrl}/v1/quote/booking`,
    {
      vehicle: {
        id: vehicle.id,
        vehicleKind: vehicle.vehicleKind,
        engineCC: vehicle.engineCC,
        loadCapacityKg: vehicle.loadCapacityKg,
      },
      startAt,
      endAt,
      estimatedDistanceKm,
    },
    {
      timeout: Number(process.env.PRICING_HTTP_TIMEOUT_MS ?? 8000),
      validateStatus: (s) => s < 500,
    },
  );

  if (quoteRes.status >= 400) {
    const err = new Error(
      quoteRes.data?.message || `Pricing quote failed: ${quoteRes.status}`,
    );
    err.statusCode = quoteRes.status;
    err.details = quoteRes.data;
    throw err;
  }

  return quoteRes.data?.data ?? quoteRes.data;
  } catch (e) {
    if (e.statusCode) throw e;
    const status = e.response?.status ?? (e.code === "ECONNREFUSED" ? 503 : 502);
    const msg =
      e.response?.data?.message ||
      e.message ||
      "Pricing quote unavailable";
    const err = new Error(msg);
    err.statusCode = status;
    err.cause = e;
    throw err;
  }
}
