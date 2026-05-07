import IORedis from "ioredis";

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const opts = { maxRetriesPerRequest: null };

/** BullMQ requires separate connections for Queue vs Worker. */
export const bullmqQueueConnection = new IORedis(url, opts);
export const bullmqWorkerConnection = new IORedis(url, opts);
