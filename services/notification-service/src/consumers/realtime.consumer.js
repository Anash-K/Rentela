import { redis } from "../lib/redis.js";
import {
  createNotification,
  markAsFailed,
  markAsSent,
} from "../services/notification.service.js";

const ALERT_CHANNEL = process.env.ALERT_REDIS_CHANNEL || "alerts:notify";
const BOOKING_CHANNEL = process.env.BOOKING_NOTIFY_CHANNEL || "booking:notify";

function getAlertMessage(payload) {
  if (payload?.message) return String(payload.message);
  return `${payload?.type || "ALERT"} detected for vehicle ${payload?.vehicleId || "unknown"}`;
}

const VALID_PRIORITY = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function resolveBookingPriority(payload, eventType) {
  const p = payload?.priority;
  if (typeof p === "string" && VALID_PRIORITY.has(p)) return p;
  if (eventType === "BOOKING_OVERDUE") return "CRITICAL";
  if (
    eventType === "PAYMENT_STATUS_UPDATED" &&
    payload?.paymentStatus === "PAID"
  ) {
    return "HIGH";
  }
  if (
    ["FINAL_BILL_READY", "BILL_GENERATED", "INVOICE_GENERATED", "INVOICE_ISSUED"].includes(
      eventType,
    )
  ) {
    return "HIGH";
  }
  if (["PICKUP_REMINDER", "DROP_REMINDER", "RETURN_REMINDER"].includes(eventType)) {
    return "HIGH";
  }
  if (eventType === "CHECKOUT_CREATED") return "HIGH";
  return "MEDIUM";
}

function getBookingTitle(eventType, payload) {
  if (payload?.title) return String(payload.title);
  switch (eventType) {
    case "BOOKING_CREATED":
      return "Booking created";
    case "BOOKING_STARTED":
      return "Trip started";
    case "BOOKING_COMPLETED":
      return "Booking completed";
    case "BOOKING_CANCELLED":
      return "Booking cancelled";
    case "BOOKING_OVERDUE":
      return "Booking overdue";
    case "PAYMENT_STATUS_UPDATED":
      if (payload?.paymentStatus === "PAID") return "Payment received";
      return "Payment status updated";
    case "FINAL_BILL_READY":
    case "BILL_GENERATED":
      return "Final bill ready";
    case "INVOICE_GENERATED":
    case "INVOICE_ISSUED":
      return "Invoice ready";
    case "CHECKOUT_CREATED":
      return "Checkout ready";
    case "PICKUP_REMINDER":
      return "Pickup reminder";
    case "DROP_REMINDER":
    case "RETURN_REMINDER":
      return "Return reminder";
    default:
      return "Booking update";
  }
}

async function persistRealtimeNotification(source, payload) {
  const dedupeKey = payload?.dedupeKey || `${source}:${payload?.bookingId || payload?.vehicleId || "unknown"}:${payload?.type || payload?.eventType || "event"}`;
  let notification = null;
  try {
    if (source === "alerts") {
      notification = await createNotification({
        userId: payload?.userId || null,
        channel: "IN_APP",
        eventKey: payload?.type || "ALERT",
        title: payload?.title || "Vehicle Alert",
        message: getAlertMessage(payload),
        payload,
        priority: payload?.type === "TAMPER_ALERT" ? "CRITICAL" : "HIGH",
        dedupeKey,
      });
    } else {
      const eventType = payload?.eventType;
      notification = await createNotification({
        userId: payload?.userId || null,
        channel: "IN_APP",
        eventKey: eventType || "BOOKING_EVENT",
        title: getBookingTitle(eventType, payload),
        message:
          payload?.message ||
          `Booking ${payload?.bookingId || ""} updated to ${payload?.status || "latest state"}`,
        payload,
        priority: resolveBookingPriority(payload, eventType),
        dedupeKey,
      });
    }
    await markAsSent(notification.id);
    return notification;
  } catch (err) {
    if (String(err?.message || "").includes("Unique constraint failed")) {
      return null;
    }
    if (notification?.id) {
      await markAsFailed(notification.id, err.message);
    }
    console.error("Realtime notification persist failed:", err.message);
    return null;
  }
}

export async function startRealtimeConsumer(onNotification) {
  const sub = redis.duplicate();
  sub.on("error", (err) => {
    console.error("Realtime consumer redis error:", err.message);
  });

  await sub.subscribe(ALERT_CHANNEL, BOOKING_CHANNEL);
  console.log("Realtime notification consumer started");

  sub.on("message", async (channel, message) => {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }

    if (channel === ALERT_CHANNEL) {
      const notification = await persistRealtimeNotification("alerts", payload);
      if (notification && typeof onNotification === "function") {
        onNotification(notification);
      }
    } else if (channel === BOOKING_CHANNEL) {
      const notification = await persistRealtimeNotification("booking", payload);
      if (notification && typeof onNotification === "function") {
        onNotification(notification);
      }
    }
  });
}
