// services/auth-service/src/server.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const { default: app } = await import("./app.js");

const { PORT, ACCESS_SECRET, REFRESH_SECRET } = await import("./config/env.js");

const server = app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});

process.on("SIGINT", () => {
  console.log("SIGINT received");

  server.close(() => {
    console.log("Server closed gracefully");
    process.exit(0);
  });
});
