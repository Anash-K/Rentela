import * as service from "../services/vehicle-telemetry.service.js";
import prisma from "../libs/prisma.js";

export const updateTelemetry = async (req, res, next) => {
  try {
    const data = await service.upsertTelemetry(req.params.id, req.body);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const getTelemetry = async (req, res, next) => {
  try {
    const data = await service.getTelemetry(req.params.id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const getTelemetryHistory = async (req, res) => {
  const { vehicleId } = req.params;
  const { limit = 100 } = req.query;

  // 1. Find device using vehicleId
  const device = await prisma.vehicleDevice.findUnique({
    where: { vehicleId },
  });

  if (!device) {
    return res.json({
      success: true,
      data: [],
    });
  }

  // 2. Use device.id (NOT vehicleId)
  const data = await prisma.telemetryLog.findMany({
    where: { deviceId: device.id },
    orderBy: { recordedAt: "desc" },
    take: Number(limit),
  });

  res.json({
    success: true,
    data,
  });
};
