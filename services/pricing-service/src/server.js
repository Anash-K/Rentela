import "./config/env.js";
import app from "./app.js";
import { PORT } from "./config/env.js";

const server = app.listen(PORT, () => {
  console.log(`pricing-service listening on ${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
