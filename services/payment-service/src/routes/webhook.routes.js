import { Router } from "express";
import { razorpayWebhook, stripeWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.post("/razorpay", razorpayWebhook);
router.post("/stripe", stripeWebhook);

export default router;
