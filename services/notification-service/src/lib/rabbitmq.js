// services/notification-service/src/libs/rabbitmq.js

import amqp from "amqplib";

let connection = null;
let channel = null;

export const EXCHANGE_NAME = "rental.events";

// -----------------------------------------------------
// Connect RabbitMQ
// -----------------------------------------------------
export const connectRabbitMQ = async () => {
  if (channel) return channel;

  connection = await amqp.connect(process.env.RABBITMQ_URL);

  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

  console.log("RabbitMQ connected (notification-service)");

  connection.on("close", () => {
    console.log("RabbitMQ closed");

    connection = null;
    channel = null;
  });

  connection.on("error", (err) => {
    console.error("RabbitMQ error:", err.message);
  });

  return channel;
};

channel.on("error", (err) => {
  console.error("Channel error:", err.message);
});

channel.on("close", () => {
  console.log("Channel closed");
});
