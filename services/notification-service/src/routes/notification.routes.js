import { Router } from "express";

import {
  getNotifications,
  readNotification,
} from "../controllers/notification.controller.js";

const router = Router();

// Gateway rewrites "/notifications/*" -> "/*" for notification-service.
router.get("/", getNotifications);
router.patch("/:id/read", readNotification);

export default router;
