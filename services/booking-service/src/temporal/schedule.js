import "dotenv/config";
import { Client, Connection } from "@temporalio/client";

const SCHEDULE_ID =
  process.env.BOOKING_OVERDUE_SCHEDULE_ID || "booking-overdue-fallback-scan";

async function upsertSchedule(client) {
  try {
    await client.schedule.create({
      scheduleId: SCHEDULE_ID,
      spec: {
        intervals: [
          {
            every: process.env.BOOKING_OVERDUE_INTERVAL || "15m",
          },
        ],
      },
      policies: {
        overlap: "SKIP",
      },
      action: {
        type: "startWorkflow",
        workflowType: "overdueWorkflow",
        taskQueue: process.env.BOOKING_TEMPORAL_TASK_QUEUE || "booking-overdue-queue",
        workflowId: "booking-overdue-fallback-workflow",
      },
    });
    console.log(`Temporal schedule created: ${SCHEDULE_ID}`);
  } catch (err) {
    if (!String(err?.message || "").toLowerCase().includes("already")) throw err;
    const handle = client.schedule.getHandle(SCHEDULE_ID);
    await handle.update((input) => ({
      ...input,
      spec: {
        intervals: [
          {
            every: process.env.BOOKING_OVERDUE_INTERVAL || "15m",
          },
        ],
      },
      policies: {
        overlap: "SKIP",
      },
      action: {
        ...input.action,
        workflowType: "overdueWorkflow",
        taskQueue: process.env.BOOKING_TEMPORAL_TASK_QUEUE || "booking-overdue-queue",
        workflowId: "booking-overdue-fallback-workflow",
      },
    }));
    console.log(`Temporal schedule updated: ${SCHEDULE_ID}`);
  }
}

async function run() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });
  const client = new Client({ connection });
  await upsertSchedule(client);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
