import { redis } from "../libs/redis.js";

export async function getTelemetry(req, res, next) {
  try {
    const { id } = req.params;

    const key = `vehicle:${id}:telemetry`;

    const data = await redis.get(key);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Telemetry not found",
      });
    }

    return res.json({
      success: true,
      data: JSON.parse(data),
    });
  } catch (err) {
    next(err);
  }
}
