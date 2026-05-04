// src/controllers/vehicle-transfer.controller.js

import * as transferService from "../services/vehicle-transfer.service.js";

const sendSuccess = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

// -----------------------------------------------------
// Request Transfer
// -----------------------------------------------------
export const createTransfer = async (req, res, next) => {
  try {
    const transfer = await transferService.createTransfer(
      req.params.id,
      req.body,
      req.user?.id || null,
    );

    return sendSuccess(res, { transfer }, "Transfer request created", 201);
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Approve / Reject Transfer
// -----------------------------------------------------
export const respondTransfer = async (req, res, next) => {
  try {
    const transfer = await transferService.respondTransfer(
      req.params.id,
      req.params.transferId,
      req.body,
      req.user?.id || null,
    );

    return sendSuccess(res, { transfer }, "Transfer request updated");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Receive Transfer
// -----------------------------------------------------
export const receiveTransfer = async (req, res, next) => {
  try {
    const result = await transferService.receiveTransfer(
      req.params.id,
      req.user?.id || null,
    );

    return sendSuccess(res, result, "Transfer completed successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Transfer History
// -----------------------------------------------------
export const getTransfers = async (req, res, next) => {
  try {
    const transfers = await transferService.getTransfers(req.params.id);

    return sendSuccess(res, { transfers });
  } catch (error) {
    next(error);
  }
};
