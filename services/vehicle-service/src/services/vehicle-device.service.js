import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Create Device
// -----------------------------------------------------
export const createDevice = async (data) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { id: true },
  });

  if (!vehicle) {
    throwError("Vehicle not found", 404);
  }

  const exists = await prisma.vehicleDevice.findFirst({
    where: {
      OR: [{ vehicleId: data.vehicleId }, { imei: data.imei }],
    },
    select: { id: true },
  });

  if (exists) {
    throwError("Device already assigned", 409);
  }

  return prisma.vehicleDevice.create({
    data: {
      vehicleId: data.vehicleId,
      imei: data.imei,
      simNumber: data.simNumber,
      firmwareVersion: data.firmwareVersion,
      status: data.status ?? "ONLINE",
      installedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
};

// -----------------------------------------------------
// Get Devices
// -----------------------------------------------------
export const getDevices = async () => {
  return prisma.vehicleDevice.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
};

// -----------------------------------------------------
// Get Device By Id
// -----------------------------------------------------
export const getDeviceById = async (id) => {
  const device = await prisma.vehicleDevice.findUnique({
    where: { id },
  });

  if (!device) {
    throwError("Device not found", 404);
  }

  return device;
};

// -----------------------------------------------------
// Update Device
// -----------------------------------------------------
export const updateDevice = async (id, data) => {
  await getDeviceById(id);

  return prisma.vehicleDevice.update({
    where: { id },
    data: {
      simNumber: data.simNumber,
      firmwareVersion: data.firmwareVersion,
      status: data.status,
      lastSeenAt: data.lastSeenAt ? new Date(data.lastSeenAt) : undefined,
    },
  });
};

// -----------------------------------------------------
// Delete Device
// -----------------------------------------------------
export const deleteDevice = async (id) => {
  await getDeviceById(id);

  await prisma.vehicleDevice.delete({
    where: { id },
  });

  return { success: true };
};
