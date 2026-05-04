import { proxyActivities, sleep } from "@temporalio/workflow";

const { runOverdueScan, markBookingOverdueById } = proxyActivities({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

export async function overdueWorkflow() {
  return runOverdueScan();
}

export async function bookingOverdueWorkflow(input) {
  const dropMs = new Date(input.dropTime).getTime();
  const waitMs = Math.max(0, dropMs - Date.now());
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  return markBookingOverdueById(input.bookingId);
}
