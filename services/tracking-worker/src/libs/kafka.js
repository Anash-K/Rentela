import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "tracking-worker",
  brokers: [process.env.KAFKA_BROKERS || "localhost:9092"],
});

export const producer = kafka.producer();

export async function connectKafka() {
  await producer.connect();
  console.log("Kafka connected");
}
