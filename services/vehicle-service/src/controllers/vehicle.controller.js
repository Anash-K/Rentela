import * as vehicleService from "../services/vehicle.service.js";
import { sendSuccess } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Create Vehicle
// -----------------------------------------------------
export const createVehicle = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.createVehicle(req.body);

    return sendSuccess(res, { vehicle }, "Vehicle created successfully", 201);
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Get Vehicles
// -----------------------------------------------------
export const getVehicles = async (req, res, next) => {
  try {
    const result = await vehicleService.getVehicles(req.query);

    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Get Vehicle By Id
// -----------------------------------------------------
export const getVehicleById = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);

    return sendSuccess(res, { vehicle });
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Update Vehicle
// -----------------------------------------------------
export const updateVehicle = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.body);

    return sendSuccess(res, { vehicle }, "Vehicle updated successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Update Vehicle Status
// -----------------------------------------------------
export const updateVehicleStatus = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.updateVehicleStatus(
      req.params.id,
      req.body.status,
    );

    return sendSuccess(res, { vehicle }, "Vehicle status updated");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Delete Vehicle
// -----------------------------------------------------
export const deleteVehicle = async (req, res, next) => {
  try {
    const result = await vehicleService.deleteVehicle(req.params.id);

    return sendSuccess(res, result, "Vehicle deleted successfully");
  } catch (error) {
    next(error);
  }
};
