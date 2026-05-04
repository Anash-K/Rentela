import "dotenv/config";
import { Connection, Client } from "@temporalio/client";

async function run() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const client = new Client({
    connection,
  });

  const handle = await client.workflow.start("trackingWorkflow", {
    taskQueue: "tracking-queue",

    workflowId: "tracking-sync-once-" + Date.now(),
  });

  console.log("Workflow started:", handle.workflowId);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
