import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";

import routes from "./routes/index.js";
import requestId from "./middlewares/requestId.js";
import errorHandler from "./middlewares/errorHandler.js";

const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json());
app.use(requestId);
app.use(pinoHttp());

app.use("/", routes);

app.use(errorHandler);

export default app;
