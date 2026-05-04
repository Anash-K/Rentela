import { Kafka } from "kafkajs";
import { KAFKA_BROKERS } from "../config/env.js";

export const kafka = new Kafka({
  clientId: process.env.KAFKA_INVOICE_CLIENT_ID || "invoice-service",
  brokers: KAFKA_BROKERS,
});
