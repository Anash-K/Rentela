import { Connection, Client } from "@temporalio/client";

async function run() {
  const connection = await Connection.connect({
    address: "localhost:7233",
  });

  const client = new Client({ connection });

  await client.workflow.start("trackingWorkflow", {
    taskQueue: "tracking-queue",
    workflowId: "tracking-main",
  });

  console.log("Tracking workflow started");
}

run();
