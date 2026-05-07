import amqp from "amqplib";

import {
  createNotification,
  markAsSent,
  markAsFailed,
} from "../services/notification.service.js";

const EXCHANGE_NAME = "rental.events";
const QUEUE_NAME = "notification.vehicle.queue";

export const startVehicleConsumer = async () => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);

  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

  await channel.assertQueue(QUEUE_NAME, { durable: true });

  const routingKeys = [
    "vehicle.transfer.requested",
    "vehicle.transfer.approved",
    "vehicle.transfer.rejected",
    "vehicle.transfer.completed",
    "vehicle.document.approved",
    "vehicle.document.expiring",
    "vehicle.request.submitted",
    "vehicle.request.approved",
    "vehicle.request.rejected",
    "vehicle.request.cancelled",
    "vehicle.provisioning.requested",
    "vehicle.provisioning.installed",
    "vehicle.provisioning.failed",
    "vehicle.provisioning.replaced",
    "vehicle.telemetry.test.submitted",
    "vehicle.telemetry.test.passed",
    "vehicle.telemetry.test.failed",
    "vehicle.activated",
    "vehicle.deactivated",
  ];

  for (const key of routingKeys) {
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, key);
  }

  console.log("Notification consumer started");

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    let notification = null;

    try {
      const routingKey = msg.fields.routingKey;

      const payload = JSON.parse(msg.content.toString());

      // -----------------------------------
      // Build Notification Content
      // -----------------------------------
      let title = "Notification";
      let message = "New update received";

      switch (routingKey) {
        case "vehicle.transfer.requested":
          title = "Transfer Request";
          message = "A new vehicle transfer request was created.";
          break;

        case "vehicle.transfer.approved":
          title = "Transfer Approved";
          message = "Vehicle transfer request approved.";
          break;

        case "vehicle.transfer.rejected":
          title = "Transfer Rejected";
          message = "Vehicle transfer request rejected.";
          break;

        case "vehicle.transfer.completed":
          title = "Transfer Completed";
          message = "Vehicle transfer completed successfully.";
          break;

        case "vehicle.document.approved":
          title = "Document Approved";
          message = "Vehicle document approved.";
          break;

        case "vehicle.document.expiring":
          title = "Document Expiring";
          message = "A vehicle document will expire soon.";
          break;

        case "vehicle.request.submitted":
          title = "Vehicle Onboarding Request";
          message = "New vehicle onboarding request awaits approval.";
          break;

        case "vehicle.request.approved":
          title = "Vehicle Request Approved";
          message = "Vehicle onboarding approved — tracker provisioning started.";
          break;

        case "vehicle.request.rejected":
          title = "Vehicle Request Rejected";
          message = "Vehicle onboarding request was rejected.";
          break;

        case "vehicle.request.cancelled":
          title = "Vehicle Request Cancelled";
          message = "Vehicle onboarding request was cancelled.";
          break;

        case "vehicle.provisioning.requested":
          title = "Tracker Provisioning Started";
          message = "GPS tracker provisioning has been requested with the vendor.";
          break;

        case "vehicle.provisioning.installed":
          title = "Tracker Installed";
          message = "GPS tracker installation reported by vendor — telemetry validation pending.";
          break;

        case "vehicle.provisioning.failed":
          title = "Tracker Provisioning Failed";
          message = "Tracker provisioning failed. Retry / replacement required.";
          break;

        case "vehicle.provisioning.replaced":
          title = "Tracker Replaced";
          message = "Existing tracker provisioning marked replaced; new attempt registered.";
          break;

        case "vehicle.telemetry.test.submitted":
          title = "Telemetry Test Submitted";
          message = "Ops field telemetry test submitted for review.";
          break;

        case "vehicle.telemetry.test.passed":
          title = "Telemetry Test Passed";
          message = "Telemetry test passed — vehicle is ready for admin activation.";
          break;

        case "vehicle.telemetry.test.failed":
          title = "Telemetry Test Failed";
          message = "Telemetry test failed — corrective action / retry required.";
          break;

        case "vehicle.activated":
          title = "Vehicle Activated";
          message = "Vehicle is now AVAILABLE in the booking inventory.";
          break;

        case "vehicle.deactivated":
          title = "Vehicle Deactivated";
          message = "Vehicle has been removed from active inventory.";
          break;
      }

      notification = await createNotification({
        channel: "IN_APP",
        eventKey: routingKey,
        title,
        message,
        payload,
      });

      await markAsSent(notification.id);

      channel.ack(msg);
    } catch (error) {
      console.error("Consumer Error:", error.message);

      if (notification?.id) {
        await markAsFailed(notification.id, error.message);
      }

      channel.nack(msg, false, true);
    }
  });
};
