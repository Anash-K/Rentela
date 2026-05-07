import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Get Branch or Fail
// -----------------------------------------------------
const ensureBranchExists = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });

  if (!branch) {
    throwError("Branch not found", 404);
  }
};

// -----------------------------------------------------
// Create Vehicle
// -----------------------------------------------------
export const createVehicle = async (data) => {
  await ensureBranchExists(data.branchId);

  const existing = await prisma.vehicle.findUnique({
    where: { registrationNo: data.registrationNo },
    select: { id: true },
  });

  if (existing) {
    throwError("Vehicle already exists", 409);
  }

  return prisma.vehicle.create({
    data: {
      branchId: data.branchId,
      categoryId: data.categoryId,
      vendorId: data.vendorId ?? null,

      registrationNo: data.registrationNo,
      brand: data.brand,
      model: data.model,
      variant: data.variant,

      year: data.year,
      color: data.color,
      seats: data.seats,

      fuelType: data.fuelType,
      transmission: data.transmission,

      batteryCapacity: data.batteryCapacity,
      rangeKm: data.rangeKm,

      vehicleKind: data.vehicleKind ?? undefined,
      engineCC: data.engineCC ?? undefined,
      loadCapacityKg: data.loadCapacityKg ?? undefined,

      odoMeterKm: data.odoMeterKm ?? 0,

      basePrice: data.basePrice,
      securityDeposit: data.securityDeposit,

      // Direct create defaults to ONBOARDING — admins must explicitly pass status to skip the
      // onboarding pipeline (e.g. legacy migrations). Industry-grade fleets should prefer the
      // POST /vehicle-requests flow which guarantees tracker provisioning + ops validation.
      status: data.status ?? "ONBOARDING",
      isActive: data.isActive ?? true,
    },
  });
};
// -----------------------------------------------------
// Get Vehicles (Cursor Pagination + Filters)
// -----------------------------------------------------
export const getVehicles = async (query) => {
  const { q, branchId, status, brand, fuelType, cursor, limit = 10 } = query;

  const take = Math.min(Number(limit) || 10, 50);

  const where = {
    isActive: true,
  };

  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (brand) {
    where.brand = {
      contains: brand,
      mode: "insensitive",
    };
  }

  if (fuelType) where.fuelType = fuelType;

  if (q) {
    where.OR = [
      { registrationNo: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.vehicle.findMany({
    where,
    include: {
      branch: true,
      category: true,
    },
    take: take + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let nextCursor = null;

  if (items.length > take) {
    const nextItem = items.pop();
    nextCursor = nextItem.id;
  }

  return {
    items,
    meta: {
      limit: take,
      nextCursor,
      hasMore: Boolean(nextCursor),
    },
  };
};

// -----------------------------------------------------
// Get Vehicle By Id
// -----------------------------------------------------
export const getVehicleById = async (id) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      branch: true,
      category: true,
      documents: true,
    },
  });

  if (!vehicle || !vehicle.isActive) {
    throwError("Vehicle not found", 404);
  }

  return vehicle;
};

// -----------------------------------------------------
// Update Vehicle
// -----------------------------------------------------
export const updateVehicle = async (id, data) => {
  await getVehicleById(id);

  if (data.branchId) {
    await ensureBranchExists(data.branchId);
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      branchId: data.branchId,
      categoryId: data.categoryId,
      vendorId: data.vendorId,
      brand: data.brand,
      model: data.model,
      variant: data.variant,
      color: data.color,
      fuelType: data.fuelType,
      transmission: data.transmission,
      seats: data.seats,
      year: data.year,
      vehicleKind: data.vehicleKind,
      engineCC: data.engineCC,
      loadCapacityKg: data.loadCapacityKg,
      basePrice: data.basePrice,
      securityDeposit: data.securityDeposit,
      odoMeterKm: data.odoMeterKm,
      batteryCapacity: data.batteryCapacity,
      rangeKm: data.rangeKm,
    },
  });

  return vehicle;
};

// -----------------------------------------------------
// Update Vehicle Status
// -----------------------------------------------------
export const updateVehicleStatus = async (id, status) => {
  await getVehicleById(id);

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: { status },
  });

  return vehicle;
};

// -----------------------------------------------------
// Soft Delete
// -----------------------------------------------------
export const deleteVehicle = async (id) => {
  await getVehicleById(id);

  await prisma.vehicle.update({
    where: { id },
    data: {
      isActive: false,
      status: "INACTIVE",
    },
  });

  return { success: true };
};
