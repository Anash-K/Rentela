// src/services/vehicle-transfer.service.js

import prisma from "../libs/prisma.js";
import { publishEvent } from "../libs/rabbitmq.js";
import { throwError } from "../utils/commonResponse.js";

const getVehicle = async (vehicleId) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      category: true,
    },
  });

  if (!vehicle || !vehicle.isActive) {
    throwError("Vehicle not found", 404);
  }

  return vehicle;
};

const getBranch = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, isActive: true },
  });

  if (!branch || !branch.isActive) {
    throwError("Branch not found", 404);
  }

  return branch;
};

// -----------------------------------------------------
// Dynamic Required Docs
// -----------------------------------------------------
const getRequiredDocs = (vehicle) => {
  const docs = ["RC", "INSURANCE"];

  if (vehicle.category?.name?.toLowerCase().includes("bike")) {
    docs.push("PUC");
  }

  if (vehicle.category?.name?.toLowerCase().includes("commercial")) {
    docs.push("PERMIT");
    docs.push("FITNESS");
  }

  if (vehicle.fuelType === "ELECTRIC") {
    docs.push("BATTERY_CERTIFICATE");
  }

  return [...new Set(docs)];
};

// -----------------------------------------------------
// Validate Docs Before Transfer
// -----------------------------------------------------
const validateTransferDocuments = async (vehicle) => {
  const requiredTypes = getRequiredDocs(vehicle);
  const now = new Date();

  const docs = await prisma.vehicleDocument.findMany({
    where: {
      vehicleId: vehicle.id,
      type: { in: requiredTypes },
      status: "APPROVED",
    },
  });

  const invalid = [];

  for (const type of requiredTypes) {
    const doc = docs.find((item) => item.type === type);

    if (!doc) {
      invalid.push(type);
      continue;
    }

    if (doc.expiryDate && new Date(doc.expiryDate) < now) {
      invalid.push(type);
    }
  }

  if (invalid.length) {
    throwError(`Missing/invalid documents: ${invalid.join(", ")}`, 400);
  }
};

// -----------------------------------------------------
// Create Transfer Request
// -----------------------------------------------------
export const createTransfer = async (vehicleId, data, userId) => {
  const vehicle = await getVehicle(vehicleId);

  await getBranch(data.toBranchId);

  if (vehicle.branchId === data.toBranchId) {
    throwError("Vehicle already belongs to this branch", 400);
  }

  if (["BOOKED", "IN_USE", "IN_TRANSIT"].includes(vehicle.status)) {
    throwError("Vehicle cannot be transferred right now", 400);
  }

  await validateTransferDocuments(vehicle);

  const pending = await prisma.vehicleTransfer.findFirst({
    where: {
      vehicleId,
      status: {
        in: ["REQUESTED", "APPROVED", "IN_TRANSIT"],
      },
    },
    select: { id: true },
  });

  if (pending) {
    throwError("Vehicle already has an active transfer request", 409);
  }

  const transfer = await prisma.vehicleTransfer.create({
    data: {
      vehicleId,
      fromBranchId: vehicle.branchId,
      toBranchId: data.toBranchId,
      requestedBy: userId,
      status: "REQUESTED",
    },
  });

  await publishEvent("vehicle.transfer.requested", {
    transferId: transfer.id,
    vehicleId,
    fromBranchId: vehicle.branchId,
    toBranchId: data.toBranchId,
    requestedBy: userId,
  });

  return transfer;
};

// -----------------------------------------------------
// Approve / Reject Transfer
// -----------------------------------------------------
export const respondTransfer = async (vehicleId, transferId, data, userId) => {
  const action = data.action?.toUpperCase();

  if (!["APPROVE", "REJECT"].includes(action)) {
    throwError("Action must be APPROVE or REJECT", 400);
  }

  const transfer = await prisma.vehicleTransfer.findFirst({
    where: {
      id: transferId,
      vehicleId,
      status: "REQUESTED",
    },
  });

  if (!transfer) {
    throwError("Pending transfer request not found", 404);
  }

  if (action === "REJECT") {
    const updated = await prisma.vehicleTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "CANCELLED",
        approvedBy: userId,
      },
    });

    await publishEvent("vehicle.transfer.rejected", {
      transferId: updated.id,
      vehicleId,
      toBranchId: updated.toBranchId,
      reviewedBy: userId,
    });

    return updated;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vehicleTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "IN_TRANSIT",
        approvedBy: userId,
      },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: "IN_TRANSIT",
      },
    });

    return row;
  });

  await publishEvent("vehicle.transfer.approved", {
    transferId: updated.id,
    vehicleId,
    fromBranchId: updated.fromBranchId,
    toBranchId: updated.toBranchId,
    approvedBy: userId,
  });

  return updated;
};

// -----------------------------------------------------
// Receive Transfer
// -----------------------------------------------------
export const receiveTransfer = async (vehicleId, userId) => {
  await getVehicle(vehicleId);

  const transfer = await prisma.vehicleTransfer.findFirst({
    where: {
      vehicleId,
      status: "IN_TRANSIT",
    },
    orderBy: {
      requestedAt: "desc",
    },
  });

  if (!transfer) {
    throwError("No active transfer found", 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.vehicleTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "COMPLETED",
        receivedBy: userId,
        completedAt: new Date(),
      },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        branchId: transfer.toBranchId,
        status: "AVAILABLE",
      },
    });

    return { success: true };
  });

  await publishEvent("vehicle.transfer.completed", {
    transferId: transfer.id,
    vehicleId,
    branchId: transfer.toBranchId,
    receivedBy: userId,
  });

  return result;
};

// -----------------------------------------------------
// Transfer History
// -----------------------------------------------------
export const getTransfers = async (vehicleId) => {
  await getVehicle(vehicleId);

  return prisma.vehicleTransfer.findMany({
    where: { vehicleId },
    include: {
      fromBranch: true,
      toBranch: true,
    },
    orderBy: {
      requestedAt: "desc",
    },
  });
};
