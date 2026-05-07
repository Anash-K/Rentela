import { Kafka } from "kafkajs";
import { redis } from "../libs/redis.js";
import prisma from "../libs/prisma.js";
import { detectAlerts } from "../utils/alert.utils.js";
import { getDistanceMeters } from "../utils/geofence.utils.js";

/** Redis NX dedupe window per alert type (seconds) — limits DB writes under high throughput */
const ALERT_DEDUPE_TTL_SEC = {
  LOW_BATTERY: 15 * 60,
  OVERSPEED: 3 * 60,
  GEOFENCE_ENTRY: 2 * 60,
  GEOFENCE_EXIT: 5 * 60,
  DEVICE_OFFLINE: 10 * 60,
  TAMPER_ALERT: 60 * 60,
};

const GEOFENCE_CACHE_TTL_SEC = Math.max(
  5,
  Number(process.env.GEOFENCE_CACHE_TTL_SEC ?? "30"),
);
const GEOFENCE_ENTRY_BUFFER_M = Math.max(
  0,
  Number(process.env.GEOFENCE_ENTRY_BUFFER_M ?? "10"),
);
const GEOFENCE_EXIT_BUFFER_M = Math.max(
  0,
  Number(process.env.GEOFENCE_EXIT_BUFFER_M ?? "20"),
);
const MOVING_SPEED_KMPH = Math.max(1, Number(process.env.TRIP_MOVING_SPEED_KMPH ?? "5"));
const MOVING_DISTANCE_M = Math.max(5, Number(process.env.TRIP_MOVING_DISTANCE_M ?? "30"));
const IDLE_END_SECONDS = Math.max(30, Number(process.env.TRIP_IDLE_END_SECONDS ?? "180"));
const MAX_JUMP_DISTANCE_M = Math.max(200, Number(process.env.TRIP_MAX_JUMP_DISTANCE_M ?? "5000"));
const BOOKING_DISTANCE_TTL_SEC = Math.max(3600, Number(process.env.BOOKING_DISTANCE_TTL_SEC ?? "259200"));
const MAX_TELEMETRY_SPEED_KMPH = Math.max(
  40,
  Number(process.env.TELEMETRY_MAX_SPEED_KMPH ?? "160"),
);
const MAX_CLOCK_SKEW_SEC = Math.max(
  5,
  Number(process.env.TELEMETRY_MAX_CLOCK_SKEW_SEC ?? "120"),
);
const MAX_TELEMETRY_AGE_SEC = Math.max(
  60,
  Number(process.env.TELEMETRY_MAX_AGE_SEC ?? "900"),
);
const DISTANCE_NOISE_FLOOR_M = Math.max(
  0.5,
  Number(process.env.TRIP_DISTANCE_NOISE_FLOOR_M ?? "3"),
);
const DISTANCE_JITTER_BUFFER_M = Math.max(
  5,
  Number(process.env.TRIP_DISTANCE_JITTER_BUFFER_M ?? "20"),
);
const GPS_KALMAN_Q = Math.max(1e-8, Number(process.env.GPS_KALMAN_Q ?? "0.000001"));
const GPS_KALMAN_R = Math.max(1e-8, Number(process.env.GPS_KALMAN_R ?? "0.00005"));
const GPS_KALMAN_R_MIN = Math.max(
  1e-8,
  Number(process.env.GPS_KALMAN_R_MIN ?? String(GPS_KALMAN_R * 0.4)),
);
const GPS_KALMAN_R_MAX = Math.max(
  GPS_KALMAN_R_MIN,
  Number(process.env.GPS_KALMAN_R_MAX ?? String(GPS_KALMAN_R * 8)),
);
const GPS_ADAPTIVE_R_ENABLED = process.env.GPS_ADAPTIVE_R_ENABLED !== "false";
const GPS_EMA_ALPHA = Math.min(
  1,
  Math.max(0, Number(process.env.GPS_EMA_ALPHA ?? "0.35")),
);

async function filterDedupedAlerts(deviceId, alerts) {
  if (alerts.length === 0) return [];

  const kept = [];
  for (const alert of alerts) {
    const ttl = ALERT_DEDUPE_TTL_SEC[alert.type] ?? 5 * 60;
    const key = `alert:dedupe:${deviceId}:${alert.dedupeKey ?? alert.type}`;
    try {
      const ok = await redis.set(key, "1", "EX", ttl, "NX");
      if (ok === "OK") kept.push(alert);
    } catch {
      // Redis unavailable — still persist alerts (prefer safety over deduplication)
      kept.push(alert);
    }
  }
  return kept;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRecordedAt(value) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildTelemetry(payload) {
  const speed = toNumber(payload.speedKm ?? payload.speedKmph ?? payload.speed);
  const battery = toNumber(payload.batteryPercent ?? payload.battery);
  return {
    vehicleId: payload.vehicleId,
    latitude: toNumber(payload.latitude ?? payload.lat),
    longitude: toNumber(payload.longitude ?? payload.lng ?? payload.lon),
    batteryPercent:
      battery == null ? null : Math.max(0, Math.min(100, battery)),
    speedKm:
      speed == null ? null : Math.max(0, Math.min(MAX_TELEMETRY_SPEED_KMPH, speed)),
    ignitionOn:
      typeof payload.ignitionOn === "boolean" ? payload.ignitionOn : null,
    charging: typeof payload.charging === "boolean" ? payload.charging : null,
    odometerKm: toNumber(payload.odometerKm ?? payload.odoMeterKm),
    hdop: toNumber(payload.hdop),
    gpsAccuracyM: toNumber(
      payload.gpsAccuracyM ??
        payload.accuracyM ??
        payload.horizontalAccuracyM,
    ),
    recordedAt: parseRecordedAt(payload.recordedAt ?? payload.updatedAt),
    isOnline:
      typeof payload.isOnline === "boolean" ? payload.isOnline : true,
    updatedAt: new Date(),
  };
}

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function getActiveGeofencesCached() {
  const cacheKey = "geofence:active:list";
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Best-effort cache read; fallback to DB.
  }

  const geofences = await prisma.geofence.findMany({
    where: { isActive: true },
    select: { id: true, name: true, centerLat: true, centerLng: true, radiusM: true },
  });

  try {
    await redis.set(cacheKey, JSON.stringify(geofences), "EX", GEOFENCE_CACHE_TTL_SEC);
  } catch {
    // Cache write failures should not block telemetry processing.
  }

  return geofences;
}

async function detectGeofenceTransitionAlerts(deviceId, telemetry) {
  if (!isValidCoordinate(telemetry.latitude, telemetry.longitude)) {
    return [];
  }

  const geofences = await getActiveGeofencesCached();
  if (geofences.length === 0) return [];

  const stateKey = `geofence:state:${deviceId}`;
  let previousInside = new Set();

  try {
    const raw = await redis.get(stateKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) previousInside = new Set(parsed);
    }
  } catch {
    // If state read fails, proceed with empty state.
  }

  const currentInside = new Set();
  for (const geofence of geofences) {
    if (
      !isValidCoordinate(geofence.centerLat, geofence.centerLng) ||
      !Number.isFinite(geofence.radiusM) ||
      geofence.radiusM <= 0
    ) {
      continue;
    }

    const distance = getDistanceMeters(
      telemetry.latitude,
      telemetry.longitude,
      geofence.centerLat,
      geofence.centerLng,
    );
    const wasInside = previousInside.has(geofence.id);
    const threshold = wasInside
      ? geofence.radiusM + GEOFENCE_EXIT_BUFFER_M
      : Math.max(0, geofence.radiusM - GEOFENCE_ENTRY_BUFFER_M);

    if (distance <= threshold) {
      currentInside.add(geofence.id);
    }
  }

  const alerts = [];
  for (const geofence of geofences) {
    const wasInside = previousInside.has(geofence.id);
    const isInside = currentInside.has(geofence.id);

    if (!wasInside && isInside) {
      alerts.push({
        type: "GEOFENCE_ENTRY",
        dedupeKey: `GEOFENCE_ENTRY:${geofence.id}`,
        title: "Geofence entered",
        message: `Entered geofence: ${geofence.name}.`,
      });
    } else if (wasInside && !isInside) {
      alerts.push({
        type: "GEOFENCE_EXIT",
        dedupeKey: `GEOFENCE_EXIT:${geofence.id}`,
        title: "Geofence exit detected",
        message: `Exited geofence: ${geofence.name}.`,
      });
    }
  }

  try {
    await redis.set(stateKey, JSON.stringify([...currentInside]), "EX", 7 * 24 * 60 * 60);
  } catch {
    // State persistence failure should not block alert persistence.
  }

  return alerts;
}

const ACTIVE_BOOKING_KEY = (vehicleId) => `booking:active:vehicle:${vehicleId}`;
const ACTIVE_TRIP_KEY = (deviceId) => `trip:active:${deviceId}`;
const TRIP_LAST_POINT_KEY = (deviceId) => `trip:last:${deviceId}`;
const TRIP_LAST_MOVEMENT_KEY = (deviceId) => `trip:last-movement:${deviceId}`;
const BOOKING_DISTANCE_KEY = (bookingId) => `booking:distance:${bookingId}`;
const GPS_FILTER_STATE_KEY = (deviceId) => `gps:filter:${deviceId}`;

function kalman1D(measurement, state, q = GPS_KALMAN_Q, r = GPS_KALMAN_R) {
  const hasState =
    state &&
    Number.isFinite(state.x) &&
    Number.isFinite(state.p) &&
    state.p > 0;
  let x = hasState ? state.x : measurement;
  let p = hasState ? state.p : 1;
  p += q;
  const k = p / (p + r);
  x = x + k * (measurement - x);
  p = (1 - k) * p;
  return { x, p };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Adaptive measurement noise:
 * - higher speed => trust less (more drift/multipath in motion)
 * - worse hdop / larger GPS accuracy radius => trust less
 */
function getAdaptiveKalmanR(telemetry) {
  if (!GPS_ADAPTIVE_R_ENABLED) return GPS_KALMAN_R;

  const speed = Number.isFinite(telemetry.speedKm) ? telemetry.speedKm : 0;
  const hdop = Number.isFinite(telemetry.hdop) ? telemetry.hdop : null;
  const gpsAccuracyM = Number.isFinite(telemetry.gpsAccuracyM)
    ? telemetry.gpsAccuracyM
    : null;

  const speedFactor = clamp(speed / 80, 0, 2.5);
  const hdopFactor = hdop == null ? 0 : clamp((hdop - 1) / 4, 0, 3);
  const accuracyFactor =
    gpsAccuracyM == null ? 0 : clamp((gpsAccuracyM - 5) / 20, 0, 4);

  const dynamicR =
    GPS_KALMAN_R * (1 + speedFactor + hdopFactor + accuracyFactor);
  return clamp(dynamicR, GPS_KALMAN_R_MIN, GPS_KALMAN_R_MAX);
}

async function applyGpsSmoothing(deviceId, telemetry) {
  if (!isValidCoordinate(telemetry.latitude, telemetry.longitude)) {
    return telemetry;
  }

  const rawLat = telemetry.latitude;
  const rawLng = telemetry.longitude;
  const state = parseJson(await redis.get(GPS_FILTER_STATE_KEY(deviceId)));
  const adaptiveR = getAdaptiveKalmanR(telemetry);

  const latState = kalman1D(rawLat, state?.lat, GPS_KALMAN_Q, adaptiveR);
  const lngState = kalman1D(rawLng, state?.lng, GPS_KALMAN_Q, adaptiveR);

  const prevEmaLat = Number.isFinite(state?.emaLat) ? state.emaLat : latState.x;
  const prevEmaLng = Number.isFinite(state?.emaLng) ? state.emaLng : lngState.x;
  const emaLat = prevEmaLat + GPS_EMA_ALPHA * (latState.x - prevEmaLat);
  const emaLng = prevEmaLng + GPS_EMA_ALPHA * (lngState.x - prevEmaLng);

  const smoothed = {
    ...telemetry,
    latitude: emaLat,
    longitude: emaLng,
    rawLatitude: rawLat,
    rawLongitude: rawLng,
  };

  const payload = {
    lat: { x: latState.x, p: latState.p },
    lng: { x: lngState.x, p: lngState.p },
    emaLat,
    emaLng,
    updatedAtTs: Date.now(),
  };
  await redis.set(
    GPS_FILTER_STATE_KEY(deviceId),
    JSON.stringify(payload),
    "EX",
    BOOKING_DISTANCE_TTL_SEC,
  );

  return smoothed;
}

async function getActiveBooking(vehicleId) {
  return parseJson(await redis.get(ACTIVE_BOOKING_KEY(vehicleId)));
}

async function endTrip(deviceId, tripId) {
  if (!tripId) return;
  await prisma.trip.updateMany({
    where: { id: tripId, isActive: true },
    data: { isActive: false, endTime: new Date() },
  });
  await redis.del(ACTIVE_TRIP_KEY(deviceId), TRIP_LAST_POINT_KEY(deviceId), TRIP_LAST_MOVEMENT_KEY(deviceId));
}

async function getMovementSnapshot(deviceId, telemetry) {
  const nowTs = Date.now();
  const recordedAtTs = new Date(telemetry.recordedAt).getTime();
  const lastPoint = parseJson(await redis.get(TRIP_LAST_POINT_KEY(deviceId)));
  let distanceM = 0;
  let elapsedSec = 0;
  if (
    lastPoint &&
    isValidCoordinate(lastPoint.lat, lastPoint.lng) &&
    isValidCoordinate(telemetry.latitude, telemetry.longitude)
  ) {
    distanceM = getDistanceMeters(lastPoint.lat, lastPoint.lng, telemetry.latitude, telemetry.longitude);
    elapsedSec = Math.max(0, (recordedAtTs - Number(lastPoint.recordedAtTs || nowTs)) / 1000);
    const maxReasonableDistanceM = Math.max(
      MAX_JUMP_DISTANCE_M,
      ((MAX_TELEMETRY_SPEED_KMPH + 15) / 3.6) * elapsedSec + DISTANCE_JITTER_BUFFER_M,
    );
    if (
      !Number.isFinite(distanceM) ||
      distanceM < DISTANCE_NOISE_FLOOR_M ||
      distanceM > maxReasonableDistanceM
    ) {
      distanceM = 0;
    }
  }

  const speed = telemetry.speedKm ?? 0;
  const moving = speed >= MOVING_SPEED_KMPH || distanceM >= MOVING_DISTANCE_M;
  try {
    if (isValidCoordinate(telemetry.latitude, telemetry.longitude)) {
      await redis.set(
        TRIP_LAST_POINT_KEY(deviceId),
        JSON.stringify({
          lat: telemetry.latitude,
          lng: telemetry.longitude,
          speedKm: speed,
          odometerKm: telemetry.odometerKm,
          recordedAtTs,
        }),
        "EX",
        BOOKING_DISTANCE_TTL_SEC,
      );
    }
  } catch {
    // Do not fail movement inference on Redis write error.
  }
  return { moving, distanceM };
}

async function updateTripDistance(deviceId, bookingId, tripId, telemetry) {
  if (!tripId || !isValidCoordinate(telemetry.latitude, telemetry.longitude)) return;
  const lastPoint = parseJson(await redis.get(TRIP_LAST_POINT_KEY(deviceId)));
  if (
    !lastPoint ||
    !isValidCoordinate(lastPoint.lat, lastPoint.lng)
  ) {
    await redis.set(
      TRIP_LAST_POINT_KEY(deviceId),
      JSON.stringify({ lat: telemetry.latitude, lng: telemetry.longitude }),
      "EX",
      BOOKING_DISTANCE_TTL_SEC,
    );
    return;
  }

  const distM = getDistanceMeters(lastPoint.lat, lastPoint.lng, telemetry.latitude, telemetry.longitude);
  const nowTs = Date.now();
  const currentTs = new Date(telemetry.recordedAt).getTime();
  const lastTs = Number(lastPoint.recordedAtTs || nowTs);
  const elapsedSec = Math.max(0, (currentTs - lastTs) / 1000);
  const maxReasonableDistanceM = Math.max(
    MAX_JUMP_DISTANCE_M,
    ((MAX_TELEMETRY_SPEED_KMPH + 15) / 3.6) * elapsedSec + DISTANCE_JITTER_BUFFER_M,
  );
  await redis.set(
    TRIP_LAST_POINT_KEY(deviceId),
    JSON.stringify({
      lat: telemetry.latitude,
      lng: telemetry.longitude,
      speedKm: telemetry.speedKm ?? 0,
      odometerKm: telemetry.odometerKm,
      recordedAtTs: currentTs,
    }),
    "EX",
    BOOKING_DISTANCE_TTL_SEC,
  );

  if (
    !Number.isFinite(distM) ||
    distM < DISTANCE_NOISE_FLOOR_M ||
    distM > maxReasonableDistanceM
  ) {
    return;
  }

  const odoKm = Number(telemetry.odometerKm);
  const lastOdoKm = Number(lastPoint.odometerKm);
  let deltaKm = distM / 1000;
  if (Number.isFinite(odoKm) && Number.isFinite(lastOdoKm)) {
    const odoDelta = odoKm - lastOdoKm;
    if (odoDelta >= 0 && odoDelta <= maxReasonableDistanceM / 1000) {
      deltaKm = odoDelta;
    }
  }
  if (!Number.isFinite(deltaKm) || deltaKm <= 0) return;
  await prisma.trip.update({
    where: { id: tripId },
    data: { distanceKm: { increment: deltaKm } },
  });
  await redis.incrbyfloat(BOOKING_DISTANCE_KEY(bookingId), deltaKm);
  await redis.expire(BOOKING_DISTANCE_KEY(bookingId), BOOKING_DISTANCE_TTL_SEC);
}

const kafka = new Kafka({
  clientId: "tracking-consumer",
  brokers: [process.env.KAFKA_BROKERS || "localhost:9092"],
});

const consumer = kafka.consumer({
  groupId: "tracking-group",
});

const ALERT_NOTIFY_CHANNEL =
  process.env.ALERT_REDIS_CHANNEL || "alerts:notify";

export async function startConsumer() {
  await consumer.connect();

  await consumer.subscribe({
    topic: "vehicle.telemetry",
    fromBeginning: false,
  });

  console.log("Telemetry consumer started...");

  await consumer.run({
    eachMessage: async ({ message }) => {
      let payload;
      try {
        payload = JSON.parse(message.value.toString());
      } catch {
        return;
      }
      if (!payload?.vehicleId) {
        return;
      }

      const telemetryRaw = buildTelemetry(payload);
      const now = new Date();
      const recordedAtTs = telemetryRaw.recordedAt.getTime();
      const ageSec = (now.getTime() - recordedAtTs) / 1000;
      if (ageSec > MAX_TELEMETRY_AGE_SEC || ageSec < -MAX_CLOCK_SKEW_SEC) {
        return;
      }

      const key = `vehicle:${payload.vehicleId}:telemetry`;

      try {
        const device = await prisma.vehicleDevice.upsert({
          where: { vehicleId: payload.vehicleId },
          update: {
            lastSeenAt: new Date(),
            status: telemetryRaw.isOnline ? "ONLINE" : "OFFLINE",
          },
          create: {
            vehicleId: payload.vehicleId,
            imei: `imei-${payload.vehicleId}`,
            status: telemetryRaw.isOnline ? "ONLINE" : "OFFLINE",
            lastSeenAt: new Date(),
          },
        });
        const telemetry = await applyGpsSmoothing(device.id, telemetryRaw);

        try {
          await redis.set(key, JSON.stringify(telemetry));
        } catch {
          // Redis write errors should not block device and alert persistence.
        }

        const telemetryAlerts = detectAlerts(telemetry);
        const geofenceAlerts = await detectGeofenceTransitionAlerts(
          device.id,
          telemetry,
        );
        const candidateAlerts = [...telemetryAlerts, ...geofenceAlerts];
        const alerts = await filterDedupedAlerts(device.id, candidateAlerts);

        const booking = await getActiveBooking(payload.vehicleId);
        const activeTripId = await redis.get(ACTIVE_TRIP_KEY(device.id));
        if (!booking && activeTripId) {
          await endTrip(device.id, activeTripId);
        }
        if (booking) {
          let tripId = activeTripId;
          if (tripId) {
            const trip = await prisma.trip.findUnique({
              where: { id: tripId },
              select: { id: true, bookingId: true, isActive: true },
            });
            if (!trip || !trip.isActive || trip.bookingId !== booking.bookingId) {
              await endTrip(device.id, tripId);
              tripId = null;
            }
          }

          const movement = await getMovementSnapshot(device.id, telemetry);
          if (!tripId && movement.moving) {
            const trip = await prisma.trip.create({
              data: {
                bookingId: booking.bookingId,
                vehicleId: payload.vehicleId,
                deviceId: device.id,
                isActive: true,
              },
            });
            tripId = trip.id;
            await redis.set(ACTIVE_TRIP_KEY(device.id), tripId, "EX", BOOKING_DISTANCE_TTL_SEC);
            await redis.set(
              TRIP_LAST_POINT_KEY(device.id),
              JSON.stringify({ lat: telemetry.latitude, lng: telemetry.longitude }),
              "EX",
              BOOKING_DISTANCE_TTL_SEC,
            );
          }

          if (tripId) {
            await updateTripDistance(device.id, booking.bookingId, tripId, telemetry);
            const nowTs = Date.now();
            if (movement.moving) {
              await redis.set(TRIP_LAST_MOVEMENT_KEY(device.id), String(nowTs), "EX", BOOKING_DISTANCE_TTL_SEC);
            } else {
              const lastMovingTs = Number(await redis.get(TRIP_LAST_MOVEMENT_KEY(device.id))) || nowTs;
              if (nowTs - lastMovingTs >= IDLE_END_SECONDS * 1000) {
                await endTrip(device.id, tripId);
              }
            }
          }
        }

        if (alerts.length > 0) {
          await prisma.alert.createMany({
            data: alerts.map((a) => ({
              deviceId: device.id,
              type: a.type,
              title: a.title,
              message: a.message ?? null,
            })),
          });

          const pipeline = redis.pipeline();
          const createdAt = new Date().toISOString();
          const vid = payload.vehicleId;
          for (const a of alerts) {
            pipeline.publish(
              ALERT_NOTIFY_CHANNEL,
              JSON.stringify({
                vehicleId: vid,
                type: a.type,
                title: a.title,
                message: a.message ?? null,
                createdAt,
              }),
            );
          }
          try {
            await pipeline.exec();
          } catch (pubErr) {
            console.error("Redis alert notify publish failed:", pubErr.message);
          }
        }
      } catch (error) {
        console.error("Error persisting telemetry/alerts:", error);
      }
    },
  });
}
