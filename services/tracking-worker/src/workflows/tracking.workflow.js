import { proxyActivities } from "@temporalio/workflow";
import { sleep } from "@temporalio/workflow";

const { syncAllVehicles } = proxyActivities({
  startToCloseTimeout: "5 minutes",
});

export async function trackingWorkflow() {
  while (true) {
    await syncAllVehicles();

    await sleep("10s"); // run every 10 seconds
  }
}
