/**
 * Time-boxed vehicle soft lock (PENDING + holdExpiresAt) — see booking.service createBooking.
 * Disable globally with BOOKING_HOLD_ENABLED=false (restores immediate CONFIRMED on create when combined with skip).
 */

export const BOOKING_HOLD_ENABLED = process.env.BOOKING_HOLD_ENABLED !== "false";

const rawMins = Number(process.env.BOOKING_HOLD_MINUTES ?? 15);
export const BOOKING_HOLD_MINUTES = Math.min(120, Math.max(5, Number.isFinite(rawMins) ? rawMins : 15));

export const ENABLE_BOOKING_HOLD_WORKER = process.env.ENABLE_BOOKING_HOLD_WORKER !== "false";
