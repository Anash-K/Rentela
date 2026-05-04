import axios from "axios";
import prisma from "../libs/prisma.js";
import { redis } from "../libs/redis.js";
import { fetchAutoPricingQuote } from "./pricing-quote.service.js";
import {
  startBookingOverdueWorkflow,
  stopBookingOverdueWorkflow,
} from "../temporal/overdueSchedule.service.js";
import { throwError } from "../utils/common.js";

const ACTIVE_BOOKING_KEY = (vehicleId) => `booking:active:vehicle:${vehicleId}`;
const BOOKING_DISTANCE_KEY = (bookingId) => `booking:distance:${bookingId}`;
const BOOKING_NOTIFY_CHANNEL = process.env.BOOKING_NOTIFY_CHANNEL || "booking:notify";

const PAYMENT_INTERNAL_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5006";

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function setActiveBookingCache(booking) {
  const payload = {
    bookingId: booking.id,
    vehicleId: booking.vehicleId,
    status: booking.status,
    includedKm: booking.includedKm,
    extraPerKm: booking.extraPerKm,
    extraPerHour: booking.extraPerHour,
    dropTime: booking.dropTime || booking.endAt,
  };
  await redis.set(ACTIVE_BOOKING_KEY(booking.vehicleId), JSON.stringify(payload), "EX", 60 * 60 * 24);
}

async function clearActiveBookingCache(booking) {
  await redis.del(ACTIVE_BOOKING_KEY(booking.vehicleId));
}

export async function publishBookingNotification(payload) {
  try {
    await redis.publish(
      BOOKING_NOTIFY_CHANNEL,
      JSON.stringify({
        ...payload,
        emittedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Notification fanout must not block booking lifecycle.
  }
}

export async function createBooking(data) {
  if (!data.userId || !data.vehicleId || !data.pickupBranchId || !data.startAt || !data.endAt) {
    throwError("Missing required booking fields", 400);
  }
  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    throwError("Invalid startAt/endAt", 400);
  }

  const active = await prisma.booking.findFirst({
    where: {
      vehicleId: data.vehicleId,
      status: { in: ["CONFIRMED", "ACTIVE", "OVERDUE"] },
      endAt: { gt: startAt },
      startAt: { lt: endAt },
    },
    select: { id: true },
  });
  if (active) throwError("Vehicle already has overlapping booking", 409);

  let baseAmount = toNum(data.baseAmount);
  let discountAmount = toNum(data.discountAmount);
  let extraAmount = toNum(data.extraAmount);
  const serviceFee = toNum(data.serviceFee);
  const platformFee = toNum(data.platformFee);
  const taxAmount = toNum(data.taxAmount);

  let pricingSnapshot = data.pricingSnapshot ?? null;
  let pricingVersionLabel = data.pricingVersionLabel ?? null;
  let includedKm = data.includedKm ?? null;
  let extraPerKm = data.extraPerKm ?? null;
  let extraPerHour = data.extraPerHour ?? null;

  if (data.useAutoPricing === true) {
    const quote = await fetchAutoPricingQuote({
      vehicleId: data.vehicleId,
      startAt,
      endAt,
      estimatedDistanceKm: toNum(data.estimatedDistanceKm, 0),
    });
    const br = quote.breakdown;
    const pr = quote.pricing;
    pricingSnapshot = quote.pricingSnapshot;
    pricingVersionLabel = quote.pricingVersionLabel;
    baseAmount = toNum(br.basePrice);
    extraAmount = toNum(br.extraKmCost);
    includedKm = br.allowedKm != null ? Number(br.allowedKm) : null;
    extraPerKm = pr.pricePerExtraKm != null ? Number(pr.pricePerExtraKm) : null;
    extraPerHour = pr.hourlyPrice != null ? Number(pr.hourlyPrice) : null;
  }

  const totalAmount = toNum(
    data.totalAmount,
    baseAmount + extraAmount + serviceFee + platformFee + taxAmount - discountAmount,
  );

  const booking = await prisma.booking.create({
    data: {
      userId: data.userId,
      vehicleId: data.vehicleId,
      pickupBranchId: data.pickupBranchId,
      returnBranchId: data.returnBranchId ?? null,
      startAt,
      endAt,
      pickupTime: data.pickupTime ? new Date(data.pickupTime) : startAt,
      dropTime: data.dropTime ? new Date(data.dropTime) : endAt,
      status: data.status ?? "CONFIRMED",
      isPreBooked: Boolean(data.isPreBooked),
      baseAmount,
      extraAmount,
      discountAmount,
      totalAmount,
      platformFee,
      serviceFee,
      taxAmount,
      pricingRuleId: data.pricingRuleId ?? null,
      pricingSnapshot: pricingSnapshot ?? undefined,
      pricingVersionLabel: pricingVersionLabel ?? null,
      couponCode: data.couponCode ?? null,
      securityDeposit: data.securityDeposit ?? null,
      includedKm: includedKm ?? null,
      extraPerKm: extraPerKm ?? null,
      extraPerHour: extraPerHour ?? null,
      notes: data.notes ?? null,
    },
  });

  await prisma.bookingEvent.create({
    data: { bookingId: booking.id, eventType: "BOOKING_CREATED", message: "Booking created" },
  });
  await publishBookingNotification({
    eventType: "BOOKING_CREATED",
    bookingId: booking.id,
    userId: booking.userId,
    vehicleId: booking.vehicleId,
    status: booking.status,
    message: "Booking created",
    dedupeKey: `booking:${booking.id}:created`,
  });
  return booking;
}

export async function startBooking(id, actorId) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throwError("Booking not found", 404);
  if (!["CONFIRMED", "PICKED_UP"].includes(booking.status)) {
    throwError("Booking cannot be started in current state", 409);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: "ACTIVE",
      actualStartTime: new Date(),
      pickedUpAt: new Date(),
    },
  });
  await prisma.bookingEvent.create({
    data: { bookingId: id, eventType: "BOOKING_STARTED", message: "Booking started", createdBy: actorId ?? null },
  });
  await setActiveBookingCache(updated);
  await startBookingOverdueWorkflow(id, updated.dropTime || updated.endAt);
  await publishBookingNotification({
    eventType: "BOOKING_STARTED",
    bookingId: id,
    userId: updated.userId,
    vehicleId: updated.vehicleId,
    status: updated.status,
    message: "Booking started",
    dedupeKey: `booking:${id}:started`,
  });
  return updated;
}

export async function completeBooking(id, actorId) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throwError("Booking not found", 404);
  if (!["ACTIVE", "OVERDUE"].includes(booking.status)) {
    throwError("Only active/overdue bookings can be completed", 409);
  }

  const now = new Date();
  const dropTime = booking.dropTime || booking.endAt;
  const overdueHours = Math.max(0, (now.getTime() - new Date(dropTime).getTime()) / 3600000);
  const distanceRaw = await redis.get(BOOKING_DISTANCE_KEY(id));
  const distanceKm = Math.max(0, toNum(distanceRaw, booking.distanceKm ?? 0));

  const includedKm = booking.includedKm ?? 0;
  const extraPerKm = booking.extraPerKm ?? 0;
  const extraPerHour = booking.extraPerHour ?? 0;
  const extraKm = Math.max(0, distanceKm - includedKm);
  const extraKmCost = extraKm * extraPerKm;
  const extraTimeCost = overdueHours * extraPerHour;
  const dynamicExtra = extraKmCost + extraTimeCost;

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: "COMPLETED",
      actualEndTime: now,
      returnedAt: now,
      distanceKm,
      extraAmount: dynamicExtra,
      totalAmount:
        Number(booking.baseAmount) +
        dynamicExtra +
        Number(booking.serviceFee) +
        Number(booking.platformFee) +
        Number(booking.taxAmount) -
        Number(booking.discountAmount),
    },
  });

  await prisma.bookingEvent.create({
    data: { bookingId: id, eventType: "BOOKING_COMPLETED", message: "Booking completed", createdBy: actorId ?? null },
  });
  await clearActiveBookingCache(updated);
  await redis.del(BOOKING_DISTANCE_KEY(id));
  await stopBookingOverdueWorkflow(id, "booking_completed");
  await publishBookingNotification({
    eventType: "BOOKING_COMPLETED",
    bookingId: id,
    userId: updated.userId,
    vehicleId: updated.vehicleId,
    status: updated.status,
    message: "Booking completed",
    dedupeKey: `booking:${id}:completed`,
  });
  return updated;
}

export async function cancelBooking(id, reason, actorId) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throwError("Booking not found", 404);
  if (["COMPLETED", "CANCELLED"].includes(booking.status)) {
    throwError("Booking already closed", 409);
  }
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancellationReason: reason ?? null,
      cancelledAt: new Date(),
      cancelledBy: actorId ?? null,
    },
  });
  await prisma.bookingEvent.create({
    data: { bookingId: id, eventType: "BOOKING_CANCELLED", message: reason || "Booking cancelled", createdBy: actorId ?? null },
  });
  await clearActiveBookingCache(updated);
  await redis.del(BOOKING_DISTANCE_KEY(id));
  await stopBookingOverdueWorkflow(id, "booking_cancelled");
  await publishBookingNotification({
    eventType: "BOOKING_CANCELLED",
    bookingId: id,
    userId: updated.userId,
    vehicleId: updated.vehicleId,
    status: updated.status,
    message: reason || "Booking cancelled",
    dedupeKey: `booking:${id}:cancelled`,
  });
  return updated;
}

export function getBooking(id) {
  return prisma.booking.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
}

export function listBookings(query) {
  const take = Math.min(Number(query.limit) || 20, 100);
  return prisma.booking.findMany({
    where: {
      vehicleId: query.vehicleId || undefined,
      userId: query.userId || undefined,
      status: query.status || undefined,
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getActiveBookingForVehicle(vehicleId) {
  const cached = await redis.get(ACTIVE_BOOKING_KEY(vehicleId));
  if (cached) return JSON.parse(cached);

  const booking = await prisma.booking.findFirst({
    where: { vehicleId, status: { in: ["ACTIVE", "OVERDUE"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!booking) return null;
  await setActiveBookingCache(booking);
  return {
    bookingId: booking.id,
    vehicleId: booking.vehicleId,
    status: booking.status,
    includedKm: booking.includedKm,
    extraPerKm: booking.extraPerKm,
    extraPerHour: booking.extraPerHour,
    dropTime: booking.dropTime || booking.endAt,
  };
}

export async function markOverdueBookings() {
  const now = new Date();
  const result = await prisma.booking.updateMany({
    where: {
      status: "ACTIVE",
      OR: [
        { dropTime: { lt: now } },
        { dropTime: null, endAt: { lt: now } },
      ],
    },
    data: { status: "OVERDUE" },
  });
  if (result.count > 0) {
    const overdue = await prisma.booking.findMany({
      where: {
        status: "OVERDUE",
        OR: [
          { dropTime: { lt: now } },
          { dropTime: null, endAt: { lt: now } },
        ],
      },
      select: { id: true, vehicleId: true, includedKm: true, extraPerKm: true, extraPerHour: true, dropTime: true, endAt: true },
      take: 1000,
    });
    await Promise.all(overdue.map((b) => setActiveBookingCache(b)));
  }
  return result.count;
}

export async function markBookingOverdueById(bookingId) {
  const now = new Date();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      status: true,
      endAt: true,
      dropTime: true,
      vehicleId: true,
      includedKm: true,
      extraPerKm: true,
      extraPerHour: true,
    },
  });

  if (!booking) return { changed: false, reason: "not_found" };
  if (booking.status !== "ACTIVE") return { changed: false, reason: "not_active" };

  const dueAt = booking.dropTime || booking.endAt;
  if (new Date(dueAt).getTime() > now.getTime()) {
    return { changed: false, reason: "not_due_yet" };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "OVERDUE" },
  });
  await prisma.bookingEvent.create({
    data: {
      bookingId: booking.id,
      eventType: "BOOKING_OVERDUE",
      message: "Booking marked overdue by scheduled workflow",
    },
  });
  await setActiveBookingCache(booking);
  await publishBookingNotification({
    eventType: "BOOKING_OVERDUE",
    bookingId: booking.id,
    userId: booking.userId,
    vehicleId: booking.vehicleId,
    status: "OVERDUE",
    message: "Your return is overdue — please return the vehicle or extend the booking",
    dedupeKey: `booking:${booking.id}:overdue`,
  });
  return { changed: true, bookingId };
}

export async function calculateFinalBill(bookingId, { damageCost = 0 } = {}) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throwError("Booking not found", 404);

  const now = new Date();
  const dropTime = booking.dropTime || booking.endAt;
  const overdueHours = Math.max(
    0,
    (now.getTime() - new Date(dropTime).getTime()) / 3600000,
  );

  const distanceRaw = await redis.get(BOOKING_DISTANCE_KEY(bookingId));
  const distanceKm = Math.max(0, toNum(distanceRaw, booking.distanceKm ?? 0));

  const includedKm = booking.includedKm ?? 0;
  const extraPerKm = booking.extraPerKm ?? 0;
  const extraPerHour = booking.extraPerHour ?? 0;
  const extraKm = Math.max(0, distanceKm - includedKm);

  const extraKmCost = extraKm * extraPerKm;
  const extraTimeCost = overdueHours * extraPerHour;
  const dmg = Math.max(0, toNum(damageCost, 0));

  const subtotal =
    Number(booking.baseAmount) +
    extraKmCost +
    extraTimeCost +
    dmg;

  const total =
    subtotal +
    Number(booking.serviceFee) +
    Number(booking.platformFee) +
    Number(booking.taxAmount) -
    Number(booking.discountAmount);

  return {
    bookingId,
    currency: "INR",
    distanceKm,
    overdueHours,
    includedKm,
    extraKm,
    rates: { extraPerKm, extraPerHour },
    breakdown: {
      baseAmount: Number(booking.baseAmount),
      extraKmCost,
      extraTimeCost,
      damageCost: dmg,
      platformFee: Number(booking.platformFee),
      serviceFee: Number(booking.serviceFee),
      taxAmount: Number(booking.taxAmount),
      discountAmount: Number(booking.discountAmount),
    },
    totalAmount: total,
  };
}

export async function updateBookingPaymentStatus(bookingId, { paymentStatus, paymentId }) {
  const allowed = new Set(["UNPAID", "PARTIAL", "PAID", "REFUNDED"]);
  if (!allowed.has(paymentStatus)) throwError("Invalid paymentStatus", 400);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throwError("Booking not found", 404);

  if (booking.paymentStatus === paymentStatus) {
    return booking;
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus },
  });

  await prisma.bookingEvent.create({
    data: {
      bookingId,
      eventType: "PAYMENT_STATUS_UPDATED",
      message: `Payment status updated to ${paymentStatus}${paymentId ? ` (paymentId: ${paymentId})` : ""}`,
    },
  });

  await publishBookingNotification({
    eventType: "PAYMENT_STATUS_UPDATED",
    bookingId,
    userId: updated.userId,
    vehicleId: updated.vehicleId,
    status: updated.status,
    paymentStatus,
    paymentId: paymentId ?? null,
    message:
      paymentStatus === "PAID"
        ? "Payment completed successfully"
        : `Payment status updated to ${paymentStatus}`,
    dedupeKey: `booking:${bookingId}:payment:${paymentStatus}:${paymentId ?? "none"}`,
  });

  return updated;
}

export async function createCheckoutForBooking(bookingId, { userId } = {}) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throwError("Booking not found", 404);

  if (booking.status !== "COMPLETED") {
    throwError("Booking must be completed before generating checkout", 409);
  }

  if (!userId) throwError("Unauthorized", 401);
  if (booking.userId !== userId) throwError("Forbidden", 403);

  const bill = await calculateFinalBill(bookingId, { damageCost: 0 });

  const { data: body } = await axios.post(
    `${PAYMENT_INTERNAL_URL}/booking`,
    {
      userId,
      bookingId,
      amount: bill.totalAmount,
      currency: bill.currency ?? "INR",
      method: "CARD",
    },
    { timeout: 12000 },
  );

  const payload = body?.data ?? body;

  await prisma.bookingEvent.create({
    data: {
      bookingId,
      eventType: "CHECKOUT_CREATED",
      message: `Payment checkout created (${bill.totalAmount} ${bill.currency ?? "INR"})`,
    },
  });

  const paymentRow = payload?.payment;
  await publishBookingNotification({
    eventType: "CHECKOUT_CREATED",
    bookingId,
    userId: booking.userId,
    vehicleId: booking.vehicleId,
    status: booking.status,
    totalAmount: bill.totalAmount,
    currency: bill.currency ?? "INR",
    paymentId: paymentRow?.id ?? null,
    message: `Pay ${bill.totalAmount} ${bill.currency ?? "INR"} to complete checkout`,
    dedupeKey: `booking:${bookingId}:checkout:${paymentRow?.id ?? "pending"}`,
  });

  return { bill, payment: payload?.payment, checkout: payload?.checkout };
}
