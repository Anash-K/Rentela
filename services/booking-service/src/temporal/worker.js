import "dotenv/config";
import { Worker } from "@temporalio/worker";

async function run() {
  const worker = await Worker.create({
    workflowsPath: new URL("./workflows/overdue.workflow.js", import.meta.url).pathname,
    activities: await import("./activities/overdue.activity.js"),
    taskQueue: process.env.BOOKING_TEMPORAL_TASK_QUEUE || "booking-overdue-queue",
  });

  console.log("Booking temporal worker started...");
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
