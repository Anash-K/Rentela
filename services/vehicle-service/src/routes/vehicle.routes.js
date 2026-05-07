// src/routes/vehicle.routes.js

import { Router } from "express";

import {
  createBranch,
  getBranches,
  getBranchById,
  updateBranch,
  getBranchInventory,
} from "../controllers/branch.controller.js";

import {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  updateVehicleStatus,
  deleteVehicle,
} from "../controllers/vehicle.controller.js";

import {
  getVehicleDocuments,
  addVehicleDocument,
  updateVehicleDocument,
  deleteVehicleDocument,
  reviewVehicleDocument,
  getExpiringDocuments,
} from "../controllers/vehicle-document.controller.js";

import {
  createTransfer,
  receiveTransfer,
  getTransfers,
  respondTransfer,
} from "../controllers/vehicle-transfer.controller.js";
import { syncTracking } from "../controllers/tracking.controller.js";

import { getTelemetry } from "../controllers/telemetry.controller.js";

import onboardingRoutes from "./onboarding.routes.js";

const router = Router();

// -----------------------------------------------------
// Onboarding pipeline: vehicle-requests, provisioning, telemetry tests, activation, vendor webhook.
// Registered before /:id routes so explicit subpaths win.
// -----------------------------------------------------
router.use("/", onboardingRoutes);

// -----------------------------------------------------
// Health
// -----------------------------------------------------
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "vehicle-service",
    message: "OK",
  });
});

// -----------------------------------------------------
// Branch APIs
// -----------------------------------------------------
router.get("/branches", getBranches);
router.get("/branches/:id", getBranchById);
router.post("/branches", createBranch);
router.patch("/branches/:id", updateBranch);
router.get("/branches/:id/inventory", getBranchInventory);

// -----------------------------------------------------
// Vehicle APIs
// -----------------------------------------------------
router.get("/", getVehicles);
router.get("/:id", getVehicleById);
router.post("/", createVehicle);
router.patch("/:id", updateVehicle);
router.patch("/:id/status", updateVehicleStatus);
router.delete("/:id", deleteVehicle);

// -----------------------------------------------------
// Vehicle Documents
// -----------------------------------------------------
router.get("/:id/documents", getVehicleDocuments);
router.post("/:id/documents", addVehicleDocument);
router.patch("/:id/documents/:docId", updateVehicleDocument);
router.delete("/:id/documents/:docId", deleteVehicleDocument);
router.patch("/:id/documents/:docId/review", reviewVehicleDocument);

// -----------------------------------------------------
// Alerts
// -----------------------------------------------------
router.get("/expiring-docs", getExpiringDocuments);

// -----------------------------------------------------
// Transfers
// -----------------------------------------------------
router.post("/:id/transfer", createTransfer);

router.post("/:id/receive-transfer", receiveTransfer);

router.get("/:id/transfers", getTransfers);

router.patch("/:id/transfers/:transferId/respond", respondTransfer);

// tracking
router.post("/:id/sync-tracking", syncTracking);

// telemetry
router.get("/:id/telemetry", getTelemetry);

// -----------------------------------------------------
// Pending Modules (Add Later)
// -----------------------------------------------------

// Media
// router.get("/:id/media", handler);
// router.post("/:id/media", handler);
// router.delete("/:id/media/:mediaId", handler);

// Timeline
// router.get("/:id/timeline", handler);

// Operational Insights
// router.get("/alerts", handler);
// router.get("/idle", handler);
// router.get("/unavailable", handler);

// Analytics
// router.get("/:id/performance", handler);
// router.get("/stats/overview", handler);

export default router;
