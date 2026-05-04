import { Router } from "express";

import {
  bustCache,
  finalBill,
  getActiveRules,
  health,
  quoteBooking,
} from "../controllers/pricing.controller.js";
import adminRoutes from "./admin.routes.js";

const router = Router();

router.use("/admin", adminRoutes);

router.get("/health", health);
router.get("/v1/rules/active", getActiveRules);
router.post("/v1/quote/booking", quoteBooking);
router.post("/v1/bill/final", finalBill);
router.post("/internal/v1/cache/bust", bustCache);

export default router;
