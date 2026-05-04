import {
  updateTelemetry,
  getTelemetry,
  getTelemetryHistory,
} from "../controllers/vehicle-telemetry.controller.js";
import { Router } from "express";

const router = Router();

router.patch("/:id/telemetry", updateTelemetry);
router.get("/:id/telemetry", getTelemetry);
router.get("/:vehicleId/history", getTelemetryHistory);

export default router;
