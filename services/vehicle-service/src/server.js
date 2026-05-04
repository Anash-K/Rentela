// src/server.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// import AFTER env load
const { default: app } = await import("./app.js");

const { startTracing } = await import("./libs/tracing.js");

const { PORT } = await import("./config/env.js");

await startTracing();

const server = app.listen(PORT, () => {
  console.log(`Vehicle service running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
