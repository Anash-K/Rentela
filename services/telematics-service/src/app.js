import express from "express";
import alertRoutes from "./routes/alert.routes.js";
import telemetryRoutes from "./routes/vehicle.routes.js";
import liveRoutes from "./routes/live.routes.js";

const app = express();

app.use(express.json());
app.use("/", alertRoutes);
app.use("/", telemetryRoutes);
app.use("/", liveRoutes);

app.use((err, _req, res, _next) => {
  const status = err.statusCode ?? 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

export default app;
