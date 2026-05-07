/**
 * DeviceProvisioning lifecycle: retry / cancel / vendor webhook ingestion.
 *
 * Idempotency model:
 *   - VendorWebhookEvent.{vendor, externalId} → unique → blocks duplicate webhook deliveries.
 *   - DeviceProvisioning.vendorRequestId    → unique → ties webhook callback back to attempt.
 */

import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";
import { ONBOARDING_EVENTS, emit } from "./events.js";
import { trackerVendor } from "./vendors/mapmyindia.adapter.js";
import { TRACKER_STATUS, VEHICLE_STATUS } from "./state-machine.js";

const RETRYABLE_TRACKER_STATES = new Set([
  TRACKER_STATUS.NONE,
  TRACKER_STATUS.TESTING_FAILED,
  TRACKER_STATUS.REPLACING,
]);

/** Operator-triggered retry — closes the previous failed/replaced provisioning and opens a fresh one. */
export async function retryProvisioning(vehicleId, { requestedBy, replaceExistingDevice = false } = {}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throwError("Vehicle not found", 404);
  if (vehicle.status !== VEHICLE_STATUS.ONBOARDING) {
    throwError("Retry only allowed while vehicle is in ONBOARDING", 409);
  }
  if (
    !RETRYABLE_TRACKER_STATES.has(vehicle.trackerStatus) &&
    !replaceExistingDevice
  ) {
    throwError(
      `Cannot retry — current trackerStatus is ${vehicle.trackerStatus}. Pass replaceExistingDevice=true to force.`,
      409,
    );
  }

  const lastAttempt = await prisma.deviceProvisioning.findFirst({
    where: { vehicleId },
    orderBy: { attemptNumber: "desc" },
  });

  const newAttempt = (lastAttempt?.attemptNumber ?? 0) + 1;

  const newRow = await prisma.$transaction(async (tx) => {
    if (
      lastAttempt &&
      ["REQUESTED", "ACKNOWLEDGED", "INSTALLED"].includes(lastAttempt.status) &&
      replaceExistingDevice
    ) {
      await tx.deviceProvisioning.update({
        where: { id: lastAttempt.id },
        data: {
          status: "REPLACED",
          failedAt: lastAttempt.failedAt ?? null,
        },
      });
    }

    const created = await tx.deviceProvisioning.create({
      data: {
        vehicleId,
        vendorName: trackerVendor.vendorName,
        status: "REQUESTED",
        attemptNumber: newAttempt,
        requestedBy: requestedBy ?? null,
        requestPayload: {
          source: "manual-retry",
          previousAttemptId: lastAttempt?.id ?? null,
          replaceExistingDevice,
        },
      },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        trackerStatus: TRACKER_STATUS.REQUESTED,
        currentProvisioningId: created.id,
      },
    });

    return created;
  });

  let vendorResp;
  let vendorErr;
  try {
    vendorResp = await trackerVendor.requestInstallation({
      vehicle,
      attemptNumber: newAttempt,
      requestedBy,
    });
  } catch (err) {
    vendorErr = err;
  }

  if (vendorErr || !vendorResp?.accepted) {
    await prisma.deviceProvisioning.update({
      where: { id: newRow.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: vendorErr?.message ?? "Vendor rejected request",
        responsePayload: vendorResp?.raw ?? null,
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { trackerStatus: TRACKER_STATUS.NONE, currentProvisioningId: null },
    });
    await emit(ONBOARDING_EVENTS.PROVISIONING_FAILED, {
      vehicleId,
      provisioningId: newRow.id,
      reason: vendorErr?.message ?? "Vendor rejected request",
    });
    throwError(vendorErr?.message ?? "Vendor rejected provisioning request", 502);
  }

  await prisma.deviceProvisioning.update({
    where: { id: newRow.id },
    data: {
      vendorRequestId: vendorResp.vendorRequestId,
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      responsePayload: vendorResp.raw,
    },
  });
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { trackerStatus: TRACKER_STATUS.ACKNOWLEDGED },
  });

  await emit(ONBOARDING_EVENTS.PROVISIONING_REQUESTED, {
    vehicleId,
    provisioningId: newRow.id,
    vendorRequestId: vendorResp.vendorRequestId,
    attemptNumber: newAttempt,
  });

  return prisma.deviceProvisioning.findUnique({ where: { id: newRow.id } });
}

/**
 * Vendor webhook handler — idempotent.
 *
 * Expected payload (after adapter parse):
 *   {
 *     vendor:        "MAPMYINDIA",
 *     externalId:    "evt_...",          // UNIQUE per vendor — required
 *     vendorRequestId: "mmi_...",        // ties to DeviceProvisioning row
 *     status:        "INSTALLED" | "FAILED",
 *     deviceId, imei, simNumber,
 *     reason:        "..."               // for FAILED
 *   }
 */
export async function handleVendorWebhook(payload) {
  const verify = trackerVendor.verifyWebhook?.({ externalId: payload?.externalId });
  if (verify && !verify.ok) {
    throwError(`Webhook rejected: ${verify.reason}`, 400);
  }

  const vendor = String(payload?.vendor ?? trackerVendor.vendorName);
  const externalId = String(payload?.externalId);

  // Idempotent dedupe ledger via unique (vendor, externalId).
  try {
    await prisma.vendorWebhookEvent.create({
      data: {
        vendor,
        externalId,
        status: "RECEIVED",
        payload,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return { duplicate: true };
    }
    throw e;
  }

  const provisioning = await prisma.deviceProvisioning.findUnique({
    where: { vendorRequestId: payload.vendorRequestId },
  });

  if (!provisioning) {
    await prisma.vendorWebhookEvent.update({
      where: { vendor_externalId: { vendor, externalId } },
      data: { status: "REJECTED", rejectionReason: "Unknown vendorRequestId" },
    });
    return { rejected: true, reason: "UNKNOWN_REQUEST_ID" };
  }

  if (
    provisioning.status === "INSTALLED" ||
    provisioning.status === "FAILED" ||
    provisioning.status === "REPLACED"
  ) {
    await prisma.vendorWebhookEvent.update({
      where: { vendor_externalId: { vendor, externalId } },
      data: { status: "PROCESSED" },
    });
    return { idempotent: true, provisioningId: provisioning.id };
  }

  const reportedStatus = String(payload?.status ?? "").toUpperCase();

  if (reportedStatus === "INSTALLED") {
    await prisma.$transaction(async (tx) => {
      await tx.deviceProvisioning.update({
        where: { id: provisioning.id },
        data: {
          status: "INSTALLED",
          installedAt: new Date(),
          deviceId: payload.deviceId ?? null,
          imei: payload.imei ?? null,
          simNumber: payload.simNumber ?? null,
          webhookPayload: payload,
        },
      });
      await tx.vehicle.update({
        where: { id: provisioning.vehicleId },
        data: {
          trackerStatus: TRACKER_STATUS.INSTALLED,
          deviceId: payload.deviceId ?? null,
        },
      });
    });

    await emit(ONBOARDING_EVENTS.PROVISIONING_INSTALLED, {
      vehicleId: provisioning.vehicleId,
      provisioningId: provisioning.id,
      deviceId: payload.deviceId ?? null,
    });
  } else if (reportedStatus === "FAILED") {
    await prisma.$transaction(async (tx) => {
      await tx.deviceProvisioning.update({
        where: { id: provisioning.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: payload.reason ?? "Vendor reported failure",
          webhookPayload: payload,
        },
      });
      await tx.vehicle.update({
        where: { id: provisioning.vehicleId },
        data: {
          trackerStatus: TRACKER_STATUS.NONE,
          currentProvisioningId: null,
        },
      });
    });

    await emit(ONBOARDING_EVENTS.PROVISIONING_FAILED, {
      vehicleId: provisioning.vehicleId,
      provisioningId: provisioning.id,
      reason: payload.reason ?? "Vendor reported failure",
    });
  } else {
    await prisma.vendorWebhookEvent.update({
      where: { vendor_externalId: { vendor, externalId } },
      data: { status: "REJECTED", rejectionReason: `Unsupported status ${reportedStatus}` },
    });
    return { rejected: true, reason: "UNSUPPORTED_STATUS" };
  }

  await prisma.vendorWebhookEvent.update({
    where: { vendor_externalId: { vendor, externalId } },
    data: { status: "PROCESSED" },
  });

  return { ok: true, provisioningId: provisioning.id };
}

/**
 * Dev-only helper: simulate a vendor webhook locally so e2e flows can be exercised
 * without an actual MapMyIndia callback. Production deployments should disable it.
 */
export async function devSimulateInstall(vehicleId, { deviceId } = {}) {
  if (process.env.ENABLE_VEHICLE_VENDOR_SIMULATION !== "true") {
    throwError("Simulation disabled — set ENABLE_VEHICLE_VENDOR_SIMULATION=true", 403);
  }
  const provisioning = await prisma.deviceProvisioning.findFirst({
    where: { vehicleId, status: { in: ["REQUESTED", "ACKNOWLEDGED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!provisioning) throwError("No in-flight provisioning to simulate", 404);
  if (!provisioning.vendorRequestId) {
    throwError("Provisioning missing vendorRequestId — wait for vendor ack", 409);
  }
  const externalId = `sim_${provisioning.id}_${Date.now()}`;
  return handleVendorWebhook({
    vendor: trackerVendor.vendorName,
    externalId,
    vendorRequestId: provisioning.vendorRequestId,
    status: "INSTALLED",
    deviceId: deviceId ?? `dev_${provisioning.id.slice(0, 8)}`,
    imei: `sim-imei-${provisioning.id.slice(0, 8)}`,
    simNumber: `sim-${provisioning.id.slice(0, 6)}`,
  });
}

export async function listProvisionings(vehicleId) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (!vehicle) throwError("Vehicle not found", 404);
  return prisma.deviceProvisioning.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
  });
}
