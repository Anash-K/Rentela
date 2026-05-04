import { Router } from "express";

import { adminAuth } from "../middlewares/adminAuth.js";
import {
  activateVersion,
  createTier,
  createVersion,
  getVersion,
  listVersions,
  patchTier,
  patchVersion,
  removeTier,
  removeVersion,
} from "../controllers/admin-pricing.controller.js";

const router = Router();

router.use(adminAuth);

router.get("/v1/rule-versions", listVersions);
router.get("/v1/rule-versions/:id", getVersion);
router.post("/v1/rule-versions", createVersion);
router.patch("/v1/rule-versions/:id", patchVersion);
router.delete("/v1/rule-versions/:id", removeVersion);
router.post("/v1/rule-versions/:id/activate", activateVersion);

router.post("/v1/rule-versions/:versionId/tiers", createTier);
router.patch("/v1/tiers/:tierId", patchTier);
router.delete("/v1/tiers/:tierId", removeTier);

export default router;
