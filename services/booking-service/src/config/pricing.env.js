/** Pricing / vehicle HTTP targets — explicit env avoids cwd issues */
export const PRICING_SERVICE_URL =
  process.env.PRICING_SERVICE_URL || "http://localhost:5015";

export const VEHICLE_SERVICE_URL =
  process.env.VEHICLE_SERVICE_URL || "http://localhost:5010";
