import { Server } from "socket.io";
import { startSocketConsumer } from "./socket-consumer.js";
import { redis } from "./libs/redis.js";

const ALERT_CHANNEL = process.env.ALERT_REDIS_CHANNEL || "alerts:notify";

function subscribeVehicleAlerts(io) {
  const sub = redis.duplicate();

  sub.on("error", (err) => {
    console.error("Redis alert subscriber error:", err.message);
  });

  sub.subscribe(ALERT_CHANNEL, (err) => {
    if (err) {
      console.error("Redis subscribe failed:", err.message);
    }
  });

  sub.on("message", (channel, message) => {
    if (channel !== ALERT_CHANNEL) return;
    try {
      const payload = JSON.parse(message);
      const vehicleId = payload.vehicleId;
      if (!vehicleId) return;
      io.to(`vehicle:${vehicleId}`).emit("vehicle-alert", payload);
    } catch (e) {
      console.error("Invalid alerts:notify payload:", e.message);
    }
  });
}

export const initSocket = (server) => {
  const fromEnv = (v) =>
    v
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) || [];
  const corsOrigin =
    fromEnv(process.env.SOCKET_CORS_ORIGIN).length > 0
      ? fromEnv(process.env.SOCKET_CORS_ORIGIN)
      : fromEnv(process.env.CORS_ORIGIN).length > 0
        ? fromEnv(process.env.CORS_ORIGIN)
        : ["http://localhost:3000"];

  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-vehicle", (vehicleId) => {
      socket.join(`vehicle:${vehicleId}`);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  startSocketConsumer(io);
  subscribeVehicleAlerts(io);
};
