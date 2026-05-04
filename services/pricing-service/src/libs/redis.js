import Redis from "ioredis";
import { REDIS_URL } from "../config/env.js";

export const redis =
  REDIS_URL.length > 0
    ? new Redis(REDIS_URL, {
        maxRetriesPerRequest: 2,
      })
    : null;

if (redis) {
  redis.on("error", (err) => {
    console.error("[pricing-redis]", err.message);
  });
}
