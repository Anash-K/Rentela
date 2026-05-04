import "dotenv/config";
import { Client, Connection } from "@temporalio/client";

const SCHEDULE_ID =
  process.env.BOOKING_OVERDUE_SCHEDULE_ID || "booking-overdue-fallback-scan";

async function run() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });
  const client = new Client({ connection });
  const handle = client.schedule.getHandle(SCHEDULE_ID);
  await handle.delete();
  console.log(`Temporal schedule deleted: ${SCHEDULE_ID}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
