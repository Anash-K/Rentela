import { Kafka } from "kafkajs";

import { KAFKA_BROKERS } from "../config/env.js";

export const kafka = new Kafka({
  clientId: process.env.KAFKA_BOOKING_CLIENT_ID || "booking-service",
  brokers: KAFKA_BROKERS,
});
