/** Thresholds — tune via env for production without code changes */
const OVERSPEED_LIMIT_KMPH = Number(
  process.env.TELEMETRY_OVERSPEED_KMPH ?? "80",
);
const LOW_BATTERY_PCT = Number(process.env.TELEMETRY_LOW_BATTERY_PCT ?? "20");

/**
 * Build alerts from telemetry. `type` values must match Prisma `AlertType` enum.
 */
export const detectAlerts = (telemetry) => {
  const alerts = [];

  if (telemetry.isOnline === false) {
    alerts.push({
      type: "DEVICE_OFFLINE",
      title: "Device offline",
      message: "Telemetry reports device as offline.",
    });
  }

  const speed =
    telemetry.speedKm ??
    telemetry.speedKmph ??
    telemetry.speed ??
    null;
  if (
    typeof speed === "number" &&
    Number.isFinite(speed) &&
    speed > OVERSPEED_LIMIT_KMPH
  ) {
    alerts.push({
      type: "OVERSPEED",
      title: "Overspeed detected",
      message: `Speed ${Math.round(speed)} km/h exceeds limit ${OVERSPEED_LIMIT_KMPH} km/h.`,
    });
  }

  const battery =
    telemetry.batteryPercent ?? telemetry.battery ?? null;
  if (
    typeof battery === "number" &&
    Number.isFinite(battery) &&
    battery < LOW_BATTERY_PCT
  ) {
    alerts.push({
      type: "LOW_BATTERY",
      title: "Low battery",
      message: `Battery at ${Math.round(battery)}% (threshold ${LOW_BATTERY_PCT}%).`,
    });
  }

  return alerts;
};
