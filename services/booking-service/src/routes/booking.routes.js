import { Router } from "express";
import {
  cancelBooking,
  completeBooking,
  createBooking,
  createBookingCheckout,
  createBookingPrepayCheckout,
  getBill,
  getActiveBooking,
  getBooking,
  listBookings,
  startBooking,
  updatePaymentStatus,
} from "../controllers/booking.controller.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "booking-service" });
});

router.get("/", listBookings);
router.post("/", createBooking);
router.get("/internal/vehicles/:vehicleId/active", getActiveBooking);
router.post("/internal/bookings/:id/payment-status", updatePaymentStatus);
router.get("/:id/bill", getBill);
router.post("/:id/checkout", createBookingCheckout);
router.post("/:id/checkout/prepay", createBookingPrepayCheckout);
router.get("/:id", getBooking);
router.post("/:id/start", startBooking);
router.post("/:id/complete", completeBooking);
router.post("/:id/cancel", cancelBooking);

export default router;
