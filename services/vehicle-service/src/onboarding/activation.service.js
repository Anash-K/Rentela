/**
 * Final activation gate — flips a fully-validated vehicle into the booking pool.
 *
 * Pre-conditions (any failure → 409):
 *   - Vehicle is in ONBOARDING.
 *   - Latest DeviceProvisioning is INSTALLED with deviceId set.
 *   - Latest VehicleTelemetryTest is PASSED.
 *   - Vehicle.trackerStatus is TESTING (i.e. last test passed).
 *
 * Side-effects:
 *   - Vehicle.status → AVAILABLE, trackerStatus → ACTIVE, operationalReadyAt = now.
 *   - Emits `vehicle.activated` for downstream consumers (notifications, search index, etc.).
 */

import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";
import { ONBOARDING_EVENTS, emit } from "./events.js";
import { TRACKER_STATUS, VEHICLE_STATUS } from "./state-machine.js";

export async function activateVehicle(vehicleId, { activatedBy } = {}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throwError("Vehicle not found", 404);

  if (vehicle.status !== VEHICLE_STATUS.ONBOARDING) {
    throwError(`Vehicle is not in ONBOARDING (current: ${vehicle.status})`, 409);
  }
  if (vehicle.trackerStatus !== TRACKER_STATUS.TESTING) {
    throwError(
      `Vehicle telemetry must pass before activation (trackerStatus: ${vehicle.trackerStatus})`,
      409,
    );
  }

  const lastInstall = await prisma.deviceProvisioning.findFirst({
    where: { vehicleId, status: "INSTALLED" },
    orderBy: { installedAt: "desc" },
  });
  if (!lastInstall || !lastInstall.deviceId) {
    throwError("No installed device found — cannot activate", 409);
  }

  const lastTest = await prisma.vehicleTelemetryTest.findFirst({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
  });
  if (!lastTest || lastTest.status !== "PASSED") {
    throwError("Latest telemetry test must be PASSED before activation", 409);
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      status: VEHICLE_STATUS.AVAILABLE,
      trackerStatus: TRACKER_STATUS.ACTIVE,
      deviceId: lastInstall.deviceId,
      currentProvisioningId: lastInstall.id,
      operationalReadyAt: new Date(),
    },
  });

  await emit(ONBOARDING_EVENTS.ACTIVATED, {
    vehicleId,
    deviceId: updated.deviceId,
    activatedBy: activatedBy ?? null,
  });

  return updated;
}

export async function deactivateVehicle(vehicleId, { reason, deactivatedBy } = {}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throwError("Vehicle not found", 404);
  if (vehicle.status === VEHICLE_STATUS.RETIRED) {
    throwError("Vehicle already retired", 409);
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      status: VEHICLE_STATUS.INACTIVE,
      isActive: false,
    },
  });

  await emit(ONBOARDING_EVENTS.DEACTIVATED, {
    vehicleId,
    reason: reason ?? null,
    deactivatedBy: deactivatedBy ?? null,
  });

  return updated;
}
