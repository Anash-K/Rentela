import { Router } from "express";

import {
  activateVehicle,
  approveVehicleRequest,
  cancelVehicleRequest,
  deactivateVehicle,
  devSimulateInstall,
  getVehicleRequest,
  listProvisionings,
  listTelemetryTests,
  listVehicleRequests,
  rejectVehicleRequest,
  retryProvisioning,
  reviewTelemetryTest,
  submitTelemetryTest,
  submitVehicleRequest,
  trackerWebhook,
} from "../controllers/onboarding.controller.js";

const router = Router();

// VehicleRequest CRUD + lifecycle
router.post("/vehicle-requests", submitVehicleRequest);
router.get("/vehicle-requests", listVehicleRequests);
router.get("/vehicle-requests/:id", getVehicleRequest);
router.post("/vehicle-requests/:id/approve", approveVehicleRequest);
router.post("/vehicle-requests/:id/reject", rejectVehicleRequest);
router.post("/vehicle-requests/:id/cancel", cancelVehicleRequest);

// Provisioning
router.get("/:id/provisionings", listProvisionings);
router.post("/:id/provisionings/retry", retryProvisioning);
router.post("/:id/provisionings/simulate-install", devSimulateInstall);

// Vendor webhook (no auth here — production should add HMAC verification middleware)
router.post("/webhooks/tracker/mapmyindia", trackerWebhook);

// Telemetry tests
router.post("/:id/telemetry-tests", submitTelemetryTest);
router.get("/:id/telemetry-tests", listTelemetryTests);
router.patch("/:id/telemetry-tests/:testId/review", reviewTelemetryTest);

// Final activation / deactivation gates
router.post("/:id/activate", activateVehicle);
router.post("/:id/deactivate", deactivateVehicle);

export default router;
