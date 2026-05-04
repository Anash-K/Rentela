import { Router } from "express";
import {
  listVehicleAlerts,
  resolveVehicleAlert,
} from "../controllers/alert.controller.js";

const router = Router();

router.get("/vehicles/:vehicleId/alerts", listVehicleAlerts);
router.patch(
  "/vehicles/:vehicleId/alerts/:alertId/resolve",
  resolveVehicleAlert,
);

export default router;
