import * as branchService from "../services/branch.service.js";
import { sendSuccess } from "../utils/commonResponse.js";

// -----------------------------------------------------
// Create Branch
// -----------------------------------------------------
export const createBranch = async (req, res, next) => {
  try {
    const branch = await branchService.createBranch(req.body);

    return sendSuccess(res, { branch }, "Branch created successfully", 201);
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Get Branches
// -----------------------------------------------------
export const getBranches = async (req, res, next) => {
  try {
    const result = await branchService.getBranches(req.query);

    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Get Branch By Id
// -----------------------------------------------------
export const getBranchById = async (req, res, next) => {
  try {
    const branch = await branchService.getBranchById(req.params.id);

    return sendSuccess(res, { branch });
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Update Branch
// -----------------------------------------------------
export const updateBranch = async (req, res, next) => {
  try {
    const branch = await branchService.updateBranch(req.params.id, req.body);

    return sendSuccess(res, { branch }, "Branch updated successfully");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Inventory Summary
// -----------------------------------------------------
export const getBranchInventory = async (req, res, next) => {
  try {
    const inventory = await branchService.getBranchInventory(req.params.id);

    return sendSuccess(res, { inventory });
  } catch (error) {
    next(error);
  }
};
