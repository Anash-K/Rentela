import "dotenv/config";
import { Worker } from "@temporalio/worker";
import { connectKafka } from "./libs/kafka.js";
import { startConsumer } from "./consumers/telemetry.consumer.js";
import prisma from "./libs/prisma.js";

async function run() {
  await connectKafka();
  await startConsumer();

  console.log("DB:", process.env.DATABASE_URL);
  console.log(Object.keys(prisma));

  const worker = await Worker.create({
    workflowsPath: new URL("./workflows/tracking.workflow.js", import.meta.url)
      .pathname,

    activities: await import("./activities/tracking.activity.js"),

    taskQueue: "tracking-queue",
  });

  console.log("Tracking worker started...");

  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
