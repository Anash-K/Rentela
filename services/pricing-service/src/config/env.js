import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const primaryEnvPath = path.resolve(__dirname, "../../.env");
const cwdEnvPath = path.join(process.cwd(), ".env");
const envPath = fs.existsSync(primaryEnvPath)
  ? primaryEnvPath
  : fs.existsSync(cwdEnvPath)
    ? cwdEnvPath
    : primaryEnvPath;

dotenv.config({ path: envPath });

// If the parent process set PRICING_ADMIN_API_KEY to an empty string, dotenv does not
// override by default — reload so values from .env win for local dev.
const adminKeyOk = (v) => typeof v === "string" && v.trim().length >= 16;
if (!adminKeyOk(process.env.PRICING_ADMIN_API_KEY)) {
  dotenv.config({ path: envPath, override: true });
}

export const PORT = Number(process.env.PORT || 5015);
export const REDIS_URL = process.env.REDIS_URL || "";
export const PRICING_CACHE_TTL_SEC = Number(process.env.PRICING_CACHE_TTL_SEC ?? 120);
export const PRICING_QUOTE_MAX_DAYS = Number(process.env.PRICING_QUOTE_MAX_DAYS ?? 90);
export const PRICING_TIMEZONE = process.env.PRICING_TIMEZONE || "UTC";

/** Min 16 chars — required for `/admin/*` CRUD */
export const PRICING_ADMIN_API_KEY = (
  process.env.PRICING_ADMIN_API_KEY || ""
).trim();
