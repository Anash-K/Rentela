// src/controllers/vehicle-document.controller.js

import * as documentService from "../services/vehicle-document.service.js";
import { sendSuccess } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Get Documents
// -----------------------------------------------------
export const getVehicleDocuments = async (req, res, next) => {
  try {
    const documents = await documentService.getVehicleDocuments(req.params.id);

    return sendSuccess(res, { documents });
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Add Document
// -----------------------------------------------------
export const addVehicleDocument = async (req, res, next) => {
  try {
    const document = await documentService.addVehicleDocument(
      req.params.id,
      req.body,
      req.user?.id || null,
    );

    return sendSuccess(
      res,
      { document },
      "Document uploaded successfully",
      201,
    );
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Replace / Update Document
// -----------------------------------------------------
export const updateVehicleDocument = async (req, res, next) => {
  try {
    const document = await documentService.updateVehicleDocument(
      req.params.id,
      req.params.docId,
      req.body,
      req.user?.id || null,
    );

    return sendSuccess(res, { document }, "Document updated successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Review Document
// -----------------------------------------------------
export const reviewVehicleDocument = async (req, res, next) => {
  try {
    const document = await documentService.reviewVehicleDocument(
      req.params.id,
      req.params.docId,
      req.body,
      req.user?.id || null,
    );

    return sendSuccess(res, { document }, "Document reviewed successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Delete Document
// -----------------------------------------------------
export const deleteVehicleDocument = async (req, res, next) => {
  try {
    const result = await documentService.deleteVehicleDocument(
      req.params.id,
      req.params.docId,
    );

    return sendSuccess(res, result, "Document deleted successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Expiring Documents
// -----------------------------------------------------
export const getExpiringDocuments = async (req, res, next) => {
  try {
    const documents = await documentService.getExpiringDocuments(
      req.query.days,
    );

    return sendSuccess(res, { documents });
  } catch (error) {
    next(error);
  }
};
