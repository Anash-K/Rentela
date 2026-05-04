import { Router } from "express";
import {
  createBookingPayment,
  getPayment,
  simulateDevCapture,
} from "../controllers/payment.controller.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ success: true, service: "payment-service" }));

router.post("/booking", createBookingPayment);

router.post("/internal/dev/simulate-capture/:id", simulateDevCapture);

router.get("/:id", getPayment);

export default router;
