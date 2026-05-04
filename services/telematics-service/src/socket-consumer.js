import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "socket-consumer",
  brokers: [process.env.KAFKA_BROKERS || "localhost:9092"],
});

export const startSocketConsumer = async (io) => {
  const consumer = kafka.consumer({
    groupId: "socket-group", // different from tracking-worker
  });

  await consumer.connect();

  await consumer.subscribe({
    topic: "vehicle.telemetry",
    fromBeginning: false,
  });

  console.log("Socket Kafka consumer started...");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      console.log("📡 Kafka event received in socket:", payload);

      io.to(`vehicle:${payload.vehicleId}`).emit("live-location", payload);
    },
  });
};
