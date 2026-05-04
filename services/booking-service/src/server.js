import "dotenv/config";
import pino from "pino";

import app from "./app.js";
import { startTripReminderWorker } from "./jobs/tripReminder.worker.js";
import { disconnectDlqProducer } from "./kafka/dlq.js";
import { startPaymentCompletedConsumer } from "./kafka/payment-completed.consumer.js";

const logger = pino({ name: "booking-server" });

const PORT = Number(process.env.PORT || 5004);

async function bootstrap() {
  let stopKafka = async () => {};
  let stopTripReminders = async () => {};

  try {
    stopKafka = await startPaymentCompletedConsumer();
  } catch (e) {
    logger.warn({ err: e.message }, "Kafka consumer not started — booking unpaid events may backlog");
  }

  stopTripReminders = startTripReminderWorker();

  const server = app.listen(PORT, () => {
    logger.info(`Booking service listening on ${PORT}`);
  });

  const shutdown = async () => {
    await stopTripReminders();
    await stopKafka();
    await disconnectDlqProducer();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, "Booking service failed to start");
  process.exit(1);
});
