import { Router } from "express";
import { getLiveLocation } from "../controllers/live.controller.js";

const router = Router();

router.get("/vehicles/:id/live-location", getLiveLocation);

export default router;
