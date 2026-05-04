import prisma from "../libs/prisma.js";
import { trackingProvider } from "../providers/tracking/provider.factory.js";

export const syncVehicleTracking = async (vehicleId) => {
  const data = await trackingProvider.getLatest(vehicleId);

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
      lastSyncedAt: data.timestamp,
    },

    create: {
      vehicleId,
      batteryPercent: data.batteryPercent,
      charging: data.charging,
      latitude: data.latitude,
      longitude: data.longitude,
      speedKm: data.speedKm,
      odoMeterKm: data.odoMeterKm,
      isOnline: data.isOnline,
      lastSyncedAt: data.timestamp,
    },
  });
};
