// src/lib/rabbitmq.js

import amqp from "amqplib";

let connection = null;
let channel = null;

const EXCHANGE_NAME = "rental.events";

// -----------------------------------------------------
// Connect RabbitMQ
// -----------------------------------------------------
export const connectRabbitMQ = async () => {
  if (channel) return channel;

  connection = await amqp.connect(process.env.RABBITMQ_URL);

  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, "topic", {
    durable: true,
  });

  console.log("RabbitMQ connected (vehicle-service)");

  connection.on("close", () => {
    console.log("RabbitMQ closed");
    channel = null;
    connection = null;
  });

  connection.on("error", (err) => {
    console.error("RabbitMQ error:", err.message);
  });

  return channel;
};

// -----------------------------------------------------
// Publish Event
// -----------------------------------------------------
export const publishEvent = async (routingKey, payload) => {
  const ch = await connectRabbitMQ();

  ch.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: "application/json",
  });
};
