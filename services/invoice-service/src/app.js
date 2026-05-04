import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import pinoHttp from "pino-http";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp());

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "invoice-service" });
});

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

app.use((err, _req, res, _next) =>
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Error" }));

export default app;
