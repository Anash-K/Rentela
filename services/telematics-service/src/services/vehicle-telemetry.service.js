import prisma from "../libs/prisma.js";
import { throwError } from "../utils/common.js";

const ensureVehicleExists = async (vehicleId) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });

  if (!vehicle) {
    throwError("Vehicle not found", 404);
  }
};

// Create or Update telemetry
export const upsertTelemetry = async (vehicleId, data) => {
  await ensureVehicleExists(vehicleId);

  return prisma.vehicleTelemetry.upsert({
    where: { vehicleId },
    update: {
      batteryPercent: data.batteryPercent,
      charging: data.charging,
      latitude: data.latitude,
      longitude: data.longitude,
      speedKm: data.speedKm,
      odoMeterKm: data.odoMeterKm,
      isOnline: data.isOnline,
      lastSyncedAt: new Date(),
    },
    create: {
      vehicleId,
      batteryPercent: data.batteryPercent,
      charging: data.charging ?? false,
      latitude: data.latitude,
      longitude: data.longitude,
      speedKm: data.speedKm,
      odoMeterKm: data.odoMeterKm,
      isOnline: data.isOnline ?? true,
      lastSyncedAt: new Date(),
    },
  });
};

export const getTelemetry = async (vehicleId) => {
  await ensureVehicleExists(vehicleId);

  const telemetry = await prisma.vehicleTelemetry.findUnique({
    where: { vehicleId },
  });

  if (!telemetry) {
    throwError("Telemetry not found", 404);
  }

  return telemetry;
};
