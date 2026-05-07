import * as requestService from "../onboarding/vehicle-request.service.js";
import * as provisioningService from "../onboarding/device-provisioning.service.js";
import * as telemetryTestService from "../onboarding/telemetry-test.service.js";
import * as activationService from "../onboarding/activation.service.js";
import { sendSuccess } from "../utils/commonResponse.js";

const userIdFrom = (req) => req.headers["x-user-id"] ?? req.user?.id ?? null;

// VehicleRequest --------------------------------------------------------------

export const submitVehicleRequest = async (req, res, next) => {
  try {
    const created = await requestService.submitVehicleRequest(req.body, userIdFrom(req));
    return sendSuccess(res, { request: created }, "Vehicle request submitted", 201);
  } catch (err) {
    next(err);
  }
};

export const listVehicleRequests = async (req, res, next) => {
  try {
    const result = await requestService.listVehicleRequests(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const getVehicleRequest = async (req, res, next) => {
  try {
    const request = await requestService.getVehicleRequest(req.params.id);
    return sendSuccess(res, { request });
  } catch (err) {
    next(err);
  }
};

export const approveVehicleRequest = async (req, res, next) => {
  try {
    const result = await requestService.approveVehicleRequest(req.params.id, {
      reviewedBy: userIdFrom(req),
      notes: req.body?.notes,
    });
    return sendSuccess(res, { vehicle: result }, "Vehicle request approved");
  } catch (err) {
    next(err);
  }
};

export const rejectVehicleRequest = async (req, res, next) => {
  try {
    const result = await requestService.rejectVehicleRequest(req.params.id, {
      reviewedBy: userIdFrom(req),
      rejectionReason: req.body?.rejectionReason,
    });
    return sendSuccess(res, { request: result }, "Vehicle request rejected");
  } catch (err) {
    next(err);
  }
};

export const cancelVehicleRequest = async (req, res, next) => {
  try {
    const result = await requestService.cancelVehicleRequest(req.params.id, {
      cancelledBy: userIdFrom(req),
    });
    return sendSuccess(res, { request: result }, "Vehicle request cancelled");
  } catch (err) {
    next(err);
  }
};

// DeviceProvisioning ----------------------------------------------------------

export const retryProvisioning = async (req, res, next) => {
  try {
    const result = await provisioningService.retryProvisioning(req.params.id, {
      requestedBy: userIdFrom(req),
      replaceExistingDevice: req.body?.replaceExistingDevice === true,
    });
    return sendSuccess(res, { provisioning: result }, "Provisioning retried", 201);
  } catch (err) {
    next(err);
  }
};

export const listProvisionings = async (req, res, next) => {
  try {
    const provisionings = await provisioningService.listProvisionings(req.params.id);
    return sendSuccess(res, { provisionings });
  } catch (err) {
    next(err);
  }
};

export const trackerWebhook = async (req, res, next) => {
  try {
    const result = await provisioningService.handleVendorWebhook(req.body);
    return sendSuccess(res, result, "Webhook processed");
  } catch (err) {
    next(err);
  }
};

export const devSimulateInstall = async (req, res, next) => {
  try {
    const result = await provisioningService.devSimulateInstall(req.params.id, {
      deviceId: req.body?.deviceId,
    });
    return sendSuccess(res, result, "Vendor install simulated");
  } catch (err) {
    next(err);
  }
};

// Telemetry tests -------------------------------------------------------------

export const submitTelemetryTest = async (req, res, next) => {
  try {
    const test = await telemetryTestService.submitTelemetryTest(
      req.params.id,
      req.body,
      userIdFrom(req),
    );
    return sendSuccess(res, { test }, "Telemetry test recorded", 201);
  } catch (err) {
    next(err);
  }
};

export const listTelemetryTests = async (req, res, next) => {
  try {
    const tests = await telemetryTestService.listTelemetryTests(req.params.id);
    return sendSuccess(res, { tests });
  } catch (err) {
    next(err);
  }
};

export const reviewTelemetryTest = async (req, res, next) => {
  try {
    const test = await telemetryTestService.reviewTelemetryTest(req.params.testId, {
      reviewedBy: userIdFrom(req),
    });
    return sendSuccess(res, { test }, "Telemetry test reviewed");
  } catch (err) {
    next(err);
  }
};

// Activation ------------------------------------------------------------------

export const activateVehicle = async (req, res, next) => {
  try {
    const vehicle = await activationService.activateVehicle(req.params.id, {
      activatedBy: userIdFrom(req),
    });
    return sendSuccess(res, { vehicle }, "Vehicle activated");
  } catch (err) {
    next(err);
  }
};

export const deactivateVehicle = async (req, res, next) => {
  try {
    const vehicle = await activationService.deactivateVehicle(req.params.id, {
      reason: req.body?.reason,
      deactivatedBy: userIdFrom(req),
    });
    return sendSuccess(res, { vehicle }, "Vehicle deactivated");
  } catch (err) {
    next(err);
  }
};
