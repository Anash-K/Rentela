import { redis } from "../libs/redis.js";

export const getLiveLocation = async (req, res) => {
  const { id: vehicleId } = req.params;

  const key = `vehicle:${vehicleId}:telemetry`;

  const data = await redis.get(key);

  if (!data) {
    return res.json({
      success: true,
      data: null,
      message: "No live data available",
    });
  }

  res.json({
    success: true,
    data: JSON.parse(data),
  });
};
