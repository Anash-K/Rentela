import {
  markBookingOverdueById as markBookingOverdueByIdService,
  markOverdueBookings,
} from "../../services/booking.service.js";

export async function runOverdueScan() {
  const updatedCount = await markOverdueBookings();
  return { updatedCount, scannedAt: new Date().toISOString() };
}

export async function markBookingOverdueById(bookingId) {
  return markBookingOverdueByIdService(bookingId);
}
