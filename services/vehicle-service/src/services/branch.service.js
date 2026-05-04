// src/services/branch.service.js

import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Create Branch
// -----------------------------------------------------
export const createBranch = async (data) => {
  const existing = await prisma.branch.findFirst({
    where: {
      OR: [{ code: data.code }, { name: data.name }],
    },
    select: { id: true },
  });

  if (existing) {
    throwError("Branch already exists", 409);
  }

  const branch = await prisma.branch.create({
    data: {
      name: data.name,
      code: data.code,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      latitude: data.latitude,
      longitude: data.longitude,
      contactNo: data.contactNo,
      email: data.email,
      isActive: data.isActive ?? true,
    },
  });

  return branch;
};

// -----------------------------------------------------
// Get Branches (Cursor Pagination)
// -----------------------------------------------------
export const getBranches = async (query) => {
  const { city, state, isActive, q, cursor, limit = 10 } = query;

  const take = Math.min(Number(limit) || 10, 50);

  const where = {};

  if (city) {
    where.city = {
      contains: city,
      mode: "insensitive",
    };
  }

  if (state) {
    where.state = {
      contains: state,
      mode: "insensitive",
    };
  }

  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  if (q) {
    where.OR = [
      {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        code: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        city: {
          contains: q,
          mode: "insensitive",
        },
      },
    ];
  }

  const items = await prisma.branch.findMany({
    where,
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
// Get Branch By Id
// -----------------------------------------------------
export const getBranchById = async (id) => {
  const branch = await prisma.branch.findUnique({
    where: { id },
  });

  if (!branch) {
    throwError("Branch not found", 404);
  }

  return branch;
};

// -----------------------------------------------------
// Update Branch
// -----------------------------------------------------
export const updateBranch = async (id, data) => {
  await getBranchById(id);

  if (data.code) {
    const codeExists = await prisma.branch.findFirst({
      where: {
        code: data.code,
        NOT: { id },
      },
      select: { id: true },
    });

    if (codeExists) {
      throwError("Branch code already in use", 409);
    }
  }

  const branch = await prisma.branch.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      latitude: data.latitude,
      longitude: data.longitude,
      contactNo: data.contactNo,
      email: data.email,
      isActive: data.isActive,
    },
  });

  return branch;
};

// -----------------------------------------------------
// Branch Inventory Summary
// -----------------------------------------------------
export const getBranchInventory = async (branchId) => {
  await getBranchById(branchId);

  const [total, available, booked, inUse, maintenance, inTransit] =
    await Promise.all([
      prisma.vehicle.count({
        where: { branchId },
      }),
      prisma.vehicle.count({
        where: {
          branchId,
          status: "AVAILABLE",
        },
      }),
      prisma.vehicle.count({
        where: {
          branchId,
          status: "BOOKED",
        },
      }),
      prisma.vehicle.count({
        where: {
          branchId,
          status: "IN_USE",
        },
      }),
      prisma.vehicle.count({
        where: {
          branchId,
          status: "UNDER_MAINTENANCE",
        },
      }),
      prisma.vehicle.count({
        where: {
          branchId,
          status: "IN_TRANSIT",
        },
      }),
    ]);

  return {
    total,
    available,
    booked,
    inUse,
    maintenance,
    inTransit,
  };
};
