import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes/index.js";
import pinoHttp from "pino-http";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

// -----------------------------------------------------
// Global Middlewares
// -----------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp());

// -----------------------------------------------------
// Health Check
// -----------------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "auth-service",
    message: "OK",
  });
});

app.use("/", routes);

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
// Error Handler
// -----------------------------------------------------
app.use(errorHandler);

export default app;
