import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";

import webhookRoutes from "./routes/webhook.routes.js";
import apiRoutes from "./routes/api.routes.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(pinoHttp());

/** Webhooks: raw body — must run before JSON parser */
app.use(
  "/webhooks",
  express.raw({
    type: ["application/json", "application/octet-stream", "*/*"],
    limit: "5mb",
  }),
  webhookRoutes,
);

app.use(express.json({ limit: "1mb" }));
app.use("/", apiRoutes);

app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));

app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Internal server error" });
});

export default app;
