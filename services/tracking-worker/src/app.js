import express from "express";
import telemetryRoutes from "./routes/telemetry.routes.js";

const app = express();

app.use(express.json());

app.use("/api", telemetryRoutes);

export default app;
