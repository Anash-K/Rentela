import { getTemporalClient } from "./client.js";

const bookingWorkflowId = (bookingId) => `booking-overdue:${bookingId}`;

function isNotFoundError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("not found") || msg.includes("notfound");
}

export async function startBookingOverdueWorkflow(bookingId, dropTime) {
  try {
    const client = await getTemporalClient();
    await client.workflow.start("bookingOverdueWorkflow", {
      taskQueue: process.env.BOOKING_TEMPORAL_TASK_QUEUE || "booking-overdue-queue",
      workflowId: bookingWorkflowId(bookingId),
      args: [{ bookingId, dropTime: new Date(dropTime).toISOString() }],
    });
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("already started")) return;
    console.error(`Failed to start booking overdue workflow (${bookingId}):`, msg);
  }
}

export async function stopBookingOverdueWorkflow(bookingId, reason = "booking_closed") {
  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(bookingWorkflowId(bookingId));
    await handle.terminate(reason);
  } catch (err) {
    if (isNotFoundError(err)) return;
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("workflow execution already completed")) return;
    console.error(`Failed to stop booking overdue workflow (${bookingId}):`, msg);
  }
}
