import prisma from "../libs/prisma.js";
import { throwError } from "../utils/common.js";

export async function listAlertsForVehicle(vehicleId, query) {
  const { cursor, limit = 20, unresolvedOnly } = query;

  const take = Math.min(Number(limit) || 20, 100);

  const device = await prisma.vehicleDevice.findUnique({
    where: { vehicleId },
    select: { id: true },
  });

  if (!device) {
    return {
      items: [],
      meta: { limit: take, nextCursor: null, hasMore: false },
    };
  }

  const unresolved =
    unresolvedOnly === "true" ||
    unresolvedOnly === "1" ||
    unresolvedOnly === true;

  const where = {
    deviceId: device.id,
    ...(unresolved ? { isResolved: false } : {}),
  };

  const items = await prisma.alert.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      isResolved: true,
      resolvedAt: true,
      createdAt: true,
    },
  });

  let nextCursor = null;
  if (items.length > take) {
    const next = items.pop();
    nextCursor = next.id;
  }

  return {
    items,
    meta: {
      limit: take,
      nextCursor,
      hasMore: Boolean(nextCursor),
    },
  };
}

export async function resolveAlert(vehicleId, alertId) {
  const alert = await prisma.alert.findFirst({
    where: {
      id: alertId,
      device: { vehicleId },
    },
    select: { id: true },
  });

  if (!alert) {
    throwError("Alert not found", 404);
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      isResolved: true,
      resolvedAt: true,
      createdAt: true,
    },
  });
}
