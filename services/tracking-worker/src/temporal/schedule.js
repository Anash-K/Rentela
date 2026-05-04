import "dotenv/config";
import { Connection, Client } from "@temporalio/client";

async function run() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const client = new Client({ connection });

  await client.schedule.create({
    scheduleId: "tracking-auto-sync",

    spec: {
      intervals: [{ every: "10s" }],
    },

    action: {
      type: "startWorkflow",

      workflowType: "trackingWorkflow",

      taskQueue: "tracking-queue",

      args: [],

      workflowId: "tracking-scheduled",
    },
  });

  console.log("Temporal schedule created");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
