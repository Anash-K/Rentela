import app from "./app.js";
import { PORT } from "./config/env.js";

const server = app.listen(PORT, () => {
  console.log(`Gateway running on port ${PORT}`);
});

// Graceful shutdown for deployments / docker stop / PM2 restart
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gateway...");

  server.close(() => {
    console.log("Gateway closed");
    process.exit(0);
  });
});

// Handle Ctrl + C in local development
process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gateway...");

  server.close(() => {
    console.log("Gateway closed");
    process.exit(0);
  });
});

// Optional: Catch unexpected crashes
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

server.on("error", (err) => {
  console.error("Server error:", err);
});
