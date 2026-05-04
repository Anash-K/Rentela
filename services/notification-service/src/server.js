// services/notification-service/src/server.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// Load notification-service .env explicitly
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Import AFTER env load
const { default: app } = await import("./app.js");

const { PORT } = await import("./config/env.js");

const { startVehicleConsumer } =
  await import("./consumers/vehicle.consumer.js");
const { startRealtimeConsumer } =
  await import("./consumers/realtime.consumer.js");
const { emitNotification, initSocket } = await import("./socket.js");

await startVehicleConsumer();
await startRealtimeConsumer(emitNotification);

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
