import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import bookingRoutes from "./routes/booking.routes.js";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp());

app.use("/", bookingRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

export default app;
