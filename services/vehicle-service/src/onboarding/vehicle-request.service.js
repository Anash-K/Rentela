/**
 * VehicleRequest lifecycle: submit → approve (creates Vehicle + initial DeviceProvisioning) / reject / cancel.
 *
 * Approval is the single transactional gate that creates the real Vehicle row. Tracker
 * provisioning is kicked off in the same transaction so partial failures cannot leave
 * a Vehicle in ONBOARDING with no provisioning attached.
 */

import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";
import { ONBOARDING_EVENTS, emit } from "./events.js";
import { trackerVendor } from "./vendors/mapmyindia.adapter.js";
import {
  TRACKER_STATUS,
  VEHICLE_STATUS,
} from "./state-machine.js";

const REQUIRED_FIELDS = [
  "branchId",
  "categoryId",
  "registrationNo",
  "brand",
  "model",
  "fuelType",
  "basePrice",
];

function validateRequestBody(body) {
  for (const f of REQUIRED_FIELDS) {
    if (body[f] === undefined || body[f] === null || body[f] === "") {
      throwError(`Missing required field: ${f}`, 400);
    }
  }
  const price = Number(body.basePrice);
  if (!Number.isFinite(price) || price <= 0) {
    throwError("basePrice must be a positive number", 400);
  }
}

async function ensureBranchAndCategoryExist({ branchId, categoryId }) {
  const [branch, category] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, isActive: true } }),
    prisma.vehicleCategory.findUnique({ where: { id: categoryId }, select: { id: true } }),
  ]);
  if (!branch || !branch.isActive) throwError("Branch not found or inactive", 404);
  if (!category) throwError("Category not found", 404);
}

async function assertNoConflictingRegistration(registrationNo) {
  const [existingVehicle, openRequest] = await Promise.all([
    prisma.vehicle.findUnique({ where: { registrationNo }, select: { id: true } }),
    prisma.vehicleRequest.findFirst({
      where: {
        registrationNo,
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      },
      select: { id: true, status: true },
    }),
  ]);

  if (existingVehicle) {
    throwError("Vehicle with this registration number already exists", 409);
  }
  if (openRequest) {
    throwError(
      `An open request (${openRequest.status}) already exists for this registration number`,
      409,
    );
  }
}

export async function submitVehicleRequest(body, submittedBy) {
  validateRequestBody(body);
  await ensureBranchAndCategoryExist({
    branchId: body.branchId,
    categoryId: body.categoryId,
  });
  await assertNoConflictingRegistration(body.registrationNo);

  const created = await prisma.vehicleRequest.create({
    data: {
      vendorId: body.vendorId ?? null,
      branchId: body.branchId,
      categoryId: body.categoryId,
      registrationNo: body.registrationNo,
      brand: body.brand,
      model: body.model,
      variant: body.variant ?? null,
      year: body.year ?? null,
      color: body.color ?? null,
      seats: body.seats ?? null,
      vehicleKind: body.vehicleKind ?? null,
      engineCC: body.engineCC ?? null,
      loadCapacityKg: body.loadCapacityKg ?? null,
      fuelType: body.fuelType,
      transmission: body.transmission ?? null,
      batteryCapacity: body.batteryCapacity ?? null,
      rangeKm: body.rangeKm ?? null,
      odoMeterKm: body.odoMeterKm ?? 0,
      basePrice: body.basePrice,
      securityDeposit: body.securityDeposit ?? null,
      documentRefs: body.documentRefs ?? null,
      submittedBy: submittedBy ?? null,
      notes: body.notes ?? null,
    },
  });

  await emit(ONBOARDING_EVENTS.REQUEST_SUBMITTED, {
    requestId: created.id,
    branchId: created.branchId,
    registrationNo: created.registrationNo,
    submittedBy,
  });

  return created;
}

export async function listVehicleRequests(query = {}) {
  const { status, branchId, q, cursor, limit = 20 } = query;
  const take = Math.min(Number(limit) || 20, 50);

  const where = {};
  if (status) where.status = status;
  if (branchId) where.branchId = branchId;
  if (q) {
    where.OR = [
      { registrationNo: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.vehicleRequest.findMany({
    where,
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let nextCursor = null;
  if (items.length > take) {
    nextCursor = items.pop().id;
  }
  return { items, meta: { limit: take, nextCursor, hasMore: Boolean(nextCursor) } };
}

export async function getVehicleRequest(id) {
  const request = await prisma.vehicleRequest.findUnique({ where: { id } });
  if (!request) throwError("Vehicle request not found", 404);
  return request;
}

/**
 * Approve a request:
 *   1. Validate request is PENDING_APPROVAL.
 *   2. Re-check no concurrent Vehicle was created for the same regNo.
 *   3. In one DB transaction:
 *        - Insert Vehicle (status=ONBOARDING, trackerStatus=NONE).
 *        - Insert DeviceProvisioning (status=REQUESTED, attempt 1, provisional row — vendorRequestId set after vendor call below).
 *        - Update VehicleRequest (status=APPROVED, vehicleId, reviewer fields).
 *        - Update Vehicle.currentProvisioningId, trackerStatus=REQUESTED.
 *   4. Call vendor adapter outside the txn (network) → patch DeviceProvisioning with vendorRequestId/responsePayload.
 *      Vendor failure marks the provisioning FAILED and Vehicle.trackerStatus=NONE so retry is allowed,
 *      but the Vehicle row stays so docs/audit history is preserved.
 */
export async function approveVehicleRequest(id, { reviewedBy, notes } = {}) {
  const request = await prisma.vehicleRequest.findUnique({ where: { id } });
  if (!request) throwError("Vehicle request not found", 404);
  if (request.status !== "PENDING_APPROVAL") {
    throwError(`Request is already ${request.status}`, 409);
  }

  const dup = await prisma.vehicle.findUnique({
    where: { registrationNo: request.registrationNo },
    select: { id: true },
  });
  if (dup) throwError("Vehicle with this registration already exists", 409);

  const { vehicle, provisioning } = await prisma.$transaction(async (tx) => {
    const newVehicle = await tx.vehicle.create({
      data: {
        vendorId: request.vendorId,
        categoryId: request.categoryId,
        branchId: request.branchId,
        registrationNo: request.registrationNo,
        brand: request.brand,
        model: request.model,
        variant: request.variant,
        year: request.year,
        color: request.color,
        seats: request.seats,
        vehicleKind: request.vehicleKind,
        engineCC: request.engineCC,
        loadCapacityKg: request.loadCapacityKg,
        fuelType: request.fuelType,
        transmission: request.transmission,
        batteryCapacity: request.batteryCapacity,
        rangeKm: request.rangeKm,
        odoMeterKm: request.odoMeterKm,
        basePrice: request.basePrice,
        securityDeposit: request.securityDeposit,
        status: VEHICLE_STATUS.ONBOARDING,
        trackerStatus: TRACKER_STATUS.NONE,
        onboardingRequestId: request.id,
        isActive: true,
      },
    });

    const newProvisioning = await tx.deviceProvisioning.create({
      data: {
        vehicleId: newVehicle.id,
        vendorName: trackerVendor.vendorName,
        status: "REQUESTED",
        attemptNumber: 1,
        requestedBy: reviewedBy ?? null,
        requestPayload: {
          source: "vehicle-request-approval",
          requestId: request.id,
        },
      },
    });

    await tx.vehicle.update({
      where: { id: newVehicle.id },
      data: {
        currentProvisioningId: newProvisioning.id,
        trackerStatus: TRACKER_STATUS.REQUESTED,
      },
    });

    await tx.vehicleRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedBy: reviewedBy ?? null,
        reviewedAt: new Date(),
        notes: notes ?? request.notes,
        vehicleId: newVehicle.id,
      },
    });

    return { vehicle: newVehicle, provisioning: newProvisioning };
  });

  let vendorResp = null;
  let vendorErr = null;
  try {
    vendorResp = await trackerVendor.requestInstallation({
      vehicle,
      attemptNumber: 1,
      requestedBy: reviewedBy,
    });
  } catch (err) {
    vendorErr = err;
  }

  if (vendorErr || !vendorResp?.accepted) {
    await prisma.deviceProvisioning.update({
      where: { id: provisioning.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: vendorErr?.message ?? "Vendor rejected request",
        responsePayload: vendorResp?.raw ?? null,
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { trackerStatus: TRACKER_STATUS.NONE, currentProvisioningId: null },
    });
    await emit(ONBOARDING_EVENTS.PROVISIONING_FAILED, {
      vehicleId: vehicle.id,
      provisioningId: provisioning.id,
      reason: vendorErr?.message ?? "Vendor rejected request",
    });
  } else {
    await prisma.deviceProvisioning.update({
      where: { id: provisioning.id },
      data: {
        vendorRequestId: vendorResp.vendorRequestId,
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        responsePayload: vendorResp.raw,
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { trackerStatus: TRACKER_STATUS.ACKNOWLEDGED },
    });
    await emit(ONBOARDING_EVENTS.PROVISIONING_REQUESTED, {
      vehicleId: vehicle.id,
      provisioningId: provisioning.id,
      vendorRequestId: vendorResp.vendorRequestId,
    });
  }

  await emit(ONBOARDING_EVENTS.REQUEST_APPROVED, {
    requestId: request.id,
    vehicleId: vehicle.id,
    provisioningId: provisioning.id,
    reviewedBy,
  });

  return prisma.vehicle.findUnique({
    where: { id: vehicle.id },
    include: { onboardingReq: true, provisionings: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
}

export async function rejectVehicleRequest(id, { reviewedBy, rejectionReason } = {}) {
  if (!rejectionReason) throwError("rejectionReason is required", 400);
  const request = await prisma.vehicleRequest.findUnique({ where: { id } });
  if (!request) throwError("Vehicle request not found", 404);
  if (request.status !== "PENDING_APPROVAL") {
    throwError(`Cannot reject — request is ${request.status}`, 409);
  }

  const updated = await prisma.vehicleRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
      rejectionReason,
    },
  });

  await emit(ONBOARDING_EVENTS.REQUEST_REJECTED, {
    requestId: id,
    reviewedBy,
    rejectionReason,
  });

  return updated;
}

export async function cancelVehicleRequest(id, { cancelledBy } = {}) {
  const request = await prisma.vehicleRequest.findUnique({ where: { id } });
  if (!request) throwError("Vehicle request not found", 404);
  if (request.status !== "PENDING_APPROVAL") {
    throwError(`Cannot cancel — request is ${request.status}`, 409);
  }
  const updated = await prisma.vehicleRequest.update({
    where: { id },
    data: {
      status: "CANCELLED",
      reviewedBy: cancelledBy ?? null,
      reviewedAt: new Date(),
    },
  });
  await emit(ONBOARDING_EVENTS.REQUEST_CANCELLED, { requestId: id, cancelledBy });
  return updated;
}
