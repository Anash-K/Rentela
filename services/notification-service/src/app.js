// services/notification-service/src/app.js

import express from "express";
import cors from "cors";

import notificationRoutes from "./routes/notification.routes.js";

const app = express();

// -----------------------------------------------------
// Middlewares
// -----------------------------------------------------
app.use(cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// -----------------------------------------------------
// Health Check
// -----------------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "notification-service",
    message: "OK",
  });
});

// -----------------------------------------------------
// Routes (also under /notifications for direct service access; gateway rewrites /notifications → /)
// -----------------------------------------------------
app.use("/", notificationRoutes);
app.use("/notifications", notificationRoutes);

// -----------------------------------------------------
// 404 Handler
// -----------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// -----------------------------------------------------
// Global Error Handler
// -----------------------------------------------------
app.use((error, req, res, next) => {
  console.error(error);

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || "Internal server error",
  });
});

export default app;
