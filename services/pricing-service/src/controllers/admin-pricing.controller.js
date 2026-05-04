import { sendSuccess } from "../../../../shared/utils/helper.js";
import {
  createRuleVersionSchema,
  createTierSchema,
  updateRuleVersionSchema,
  updateTierSchema,
} from "../schemas/admin.schema.js";
import * as adminPricing from "../services/admin-pricing.service.js";

export async function listVersions(_req, res, next) {
  try {
    const versions = await adminPricing.listRuleVersions();
    return sendSuccess(res, { versions });
  } catch (e) {
    next(e);
  }
}

export async function getVersion(req, res, next) {
  try {
    const version = await adminPricing.getRuleVersionWithTiers(req.params.id);
    if (!version) {
      return res.status(404).json({ success: false, message: "Rule version not found" });
    }
    return sendSuccess(res, { version });
  } catch (e) {
    next(e);
  }
}

export async function createVersion(req, res, next) {
  try {
    const body = createRuleVersionSchema.parse(req.body);
    const version = await adminPricing.createRuleVersion(body);
    return sendSuccess(res, { version }, "Rule version created", 201);
  } catch (e) {
    next(e);
  }
}

export async function patchVersion(req, res, next) {
  try {
    const body = updateRuleVersionSchema.parse(req.body);
    const version = await adminPricing.updateRuleVersion(req.params.id, body);
    return sendSuccess(res, { version }, "Rule version updated");
  } catch (e) {
    next(e);
  }
}

export async function removeVersion(req, res, next) {
  try {
    await adminPricing.deleteRuleVersion(req.params.id);
    return sendSuccess(res, {}, "Rule version deleted");
  } catch (e) {
    next(e);
  }
}

export async function activateVersion(req, res, next) {
  try {
    await adminPricing.activateRuleVersion(req.params.id);
    const version = await adminPricing.getRuleVersionWithTiers(req.params.id);
    return sendSuccess(res, { version }, "Rule version activated");
  } catch (e) {
    next(e);
  }
}

export async function createTier(req, res, next) {
  try {
    const body = createTierSchema.parse(req.body);
    const tier = await adminPricing.createTier(req.params.versionId, body);
    return sendSuccess(res, { tier }, "Tier created", 201);
  } catch (e) {
    next(e);
  }
}

export async function patchTier(req, res, next) {
  try {
    const body = updateTierSchema.parse(req.body);
    const tier = await adminPricing.updateTier(req.params.tierId, body);
    return sendSuccess(res, { tier }, "Tier updated");
  } catch (e) {
    next(e);
  }
}

export async function removeTier(req, res, next) {
  try {
    await adminPricing.deleteTier(req.params.tierId);
    return sendSuccess(res, {}, "Tier deleted");
  } catch (e) {
    next(e);
  }
}
