import { syncVehicleTracking } from "../services/tracking-sync.service.js";

export const syncTracking = async (req, res, next) => {
  try {
    const data = await syncVehicleTracking(req.params.id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};
