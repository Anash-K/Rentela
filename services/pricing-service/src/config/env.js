import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const PORT = Number(process.env.PORT || 5015);
export const REDIS_URL = process.env.REDIS_URL || "";
export const PRICING_CACHE_TTL_SEC = Number(process.env.PRICING_CACHE_TTL_SEC ?? 120);
export const PRICING_QUOTE_MAX_DAYS = Number(process.env.PRICING_QUOTE_MAX_DAYS ?? 90);
export const PRICING_TIMEZONE = process.env.PRICING_TIMEZONE || "UTC";

/** Min 16 chars — required for `/admin/*` CRUD */
export const PRICING_ADMIN_API_KEY = process.env.PRICING_ADMIN_API_KEY || "";
