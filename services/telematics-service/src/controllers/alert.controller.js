import * as alertService from "../services/alert.service.js";

export const listVehicleAlerts = async (req, res, next) => {
  try {
    const result = await alertService.listAlertsForVehicle(
      req.params.vehicleId,
      req.query,
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const resolveVehicleAlert = async (req, res, next) => {
  try {
    const alert = await alertService.resolveAlert(
      req.params.vehicleId,
      req.params.alertId,
    );

    res.json({
      success: true,
      data: { alert },
    });
  } catch (err) {
    next(err);
  }
};
