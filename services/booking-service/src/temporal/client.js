import { Client, Connection } from "@temporalio/client";

let cachedClient = null;
let cachedConnection = null;

export async function getTemporalClient() {
  if (cachedClient) return cachedClient;
  cachedConnection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });
  cachedClient = new Client({ connection: cachedConnection });
  return cachedClient;
}
