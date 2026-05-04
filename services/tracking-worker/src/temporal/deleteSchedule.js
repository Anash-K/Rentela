// deleteSchedule.js
import { Connection, Client } from "@temporalio/client";

const run = async () => {
  const connection = await Connection.connect({
    address: "localhost:7233",
  });

  const client = new Client({ connection });

  const handle = client.schedule.getHandle("tracking-auto-sync");

  await handle.delete();

  console.log("Schedule deleted");
};

run();
