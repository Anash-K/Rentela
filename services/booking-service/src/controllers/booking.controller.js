import * as bookingService from "../services/booking.service.js";
import { sendSuccess } from "../utils/common.js";

export const createBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.body);
    return sendSuccess(res, { booking }, "Booking created", 201);
  } catch (err) {
    next(err);
  }
};

export const startBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.startBooking(req.params.id, req.headers["x-user-id"]);
    return sendSuccess(res, { booking }, "Booking started");
  } catch (err) {
    next(err);
  }
};

export const completeBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.completeBooking(req.params.id, req.headers["x-user-id"]);
    return sendSuccess(res, { booking }, "Booking completed");
  } catch (err) {
    next(err);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.cancelBooking(
      req.params.id,
      req.body?.reason,
      req.headers["x-user-id"],
    );
    return sendSuccess(res, { booking }, "Booking cancelled");
  } catch (err) {
    next(err);
  }
};

export const getBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.params.id);
    return sendSuccess(res, { booking });
  } catch (err) {
    next(err);
  }
};

export const listBookings = async (req, res, next) => {
  try {
    const items = await bookingService.listBookings(req.query);
    return sendSuccess(res, { items });
  } catch (err) {
    next(err);
  }
};

export const getActiveBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.getActiveBookingForVehicle(req.params.vehicleId);
    return sendSuccess(res, { booking });
  } catch (err) {
    next(err);
  }
};

export const getBill = async (req, res, next) => {
  try {
    const bill = await bookingService.calculateFinalBill(req.params.id, {
      damageCost: req.query.damageCost,
    });
    return sendSuccess(res, { bill });
  } catch (err) {
    next(err);
  }
};

export const updatePaymentStatus = async (req, res, next) => {
  try {
    const booking = await bookingService.updateBookingPaymentStatus(req.params.id, {
      paymentStatus: req.body?.paymentStatus,
      paymentId: req.body?.paymentId,
    });
    return sendSuccess(res, { booking }, "Payment status updated");
  } catch (err) {
    next(err);
  }
};

export const createBookingCheckout = async (req, res, next) => {
  try {
    const payload = await bookingService.createCheckoutForBooking(req.params.id, {
      userId: req.headers["x-user-id"],
    });
    return sendSuccess(res, payload, "Checkout initiated", 201);
  } catch (err) {
    next(err);
  }
};

export const createBookingPrepayCheckout = async (req, res, next) => {
  try {
    const payload = await bookingService.createPrepayCheckoutForBooking(req.params.id, {
      userId: req.headers["x-user-id"],
      amount: req.body?.amount,
    });
    return sendSuccess(res, payload, "Prepay checkout initiated", 201);
  } catch (err) {
    next(err);
  }
};
