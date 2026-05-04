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
