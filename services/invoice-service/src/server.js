import "dotenv/config";
import pino from "pino";

import app from "./app.js";
import { PORT } from "./config/env.js";
import { disconnectDlqProducer } from "./kafka/dlq.js";
import { startInvoicePaymentCompletedConsumer } from "./kafka/kafka.consumer.js";

const logger = pino({ name: "invoice-server" });

async function bootstrap() {
  let stopKafka = async () => {};

  try {
    stopKafka = await startInvoicePaymentCompletedConsumer();
  } catch (e) {
    logger.warn({ err: e.message }, "Kafka consumer not started — invoices will not emit from payments");
  }

  const server = app.listen(PORT, () => {
    logger.info(`Invoice HTTP health on ${PORT}; payment.completed consumed via Kafka`);
  });

  const shutdown = async () => {
    await stopKafka();
    await disconnectDlqProducer();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, "Invoice service failed to start");
  process.exit(1);
});
