import crypto from "crypto";

import { PRICING_ADMIN_API_KEY } from "../config/env.js";

/**
 * Requires `PRICING_ADMIN_API_KEY` (min 16 chars).
 * Send via header `x-pricing-admin-key` or `Authorization: Bearer <key>`.
 */
export function adminAuth(req, res, next) {
  const expected = PRICING_ADMIN_API_KEY || "";
  if (expected.length < 16) {
    return res.status(503).json({
      success: false,
      message:
        "Admin API disabled — set PRICING_ADMIN_API_KEY (min 16 characters) in pricing-service env",
    });
  }

  const auth = req.headers.authorization;
  const bearer =
    typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : null;
  const provided =
    (typeof req.headers["x-pricing-admin-key"] === "string"
      ? req.headers["x-pricing-admin-key"]
      : null) || bearer;

  if (!provided) {
    return res.status(401).json({
      success: false,
      message: "Missing credentials",
    });
  }

  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
}
