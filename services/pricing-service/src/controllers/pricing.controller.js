import { sendSuccess } from "../../../../shared/utils/helper.js";
import { quoteBookingSchema, finalBillSchema } from "../schemas/quote.schema.js";
import {
  computeQuoteForVehicle,
  computeFinalBillFromSnapshot,
} from "../services/pricing-engine.service.js";
import { getActiveRulePack, bustPricingCache } from "../services/rule-version.service.js";

export async function health(_req, res) {
  res.json({ success: true, service: "pricing-service" });
}

export async function getActiveRules(_req, res, next) {
  try {
    const { version, tiers } = await getActiveRulePack();
    return sendSuccess(res, {
      version: {
        id: version.id,
        versionLabel: version.versionLabel,
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
      },
      tierCount: tiers.length,
      tierKinds: [...new Set(tiers.map((t) => t.vehicleKind))],
    });
  } catch (e) {
    next(e);
  }
}

export async function quoteBooking(req, res, next) {
  try {
    const body = quoteBookingSchema.parse(req.body);
    const result = await computeQuoteForVehicle(body.vehicle, {
      startAt: body.startAt,
      endAt: body.endAt,
      estimatedDistanceKm: body.estimatedDistanceKm,
    });
    return sendSuccess(res, result, "Quote computed");
  } catch (e) {
    next(e);
  }
}

export async function finalBill(req, res, next) {
  try {
    const body = finalBillSchema.parse(req.body);
    const bill = computeFinalBillFromSnapshot(body.pricingSnapshot, {
      actualKm: body.actualKm,
      actualEnd: body.actualEnd,
    });
    return sendSuccess(res, { bill }, "Final bill computed");
  } catch (e) {
    next(e);
  }
}

/** Ops: invalidate Redis tier cache after DB rule changes */
export async function bustCache(req, res, next) {
  try {
    const secret = process.env.PRICING_CACHE_BUST_SECRET;
    if (secret && req.headers["x-pricing-bust-secret"] !== secret) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    await bustPricingCache();
    return sendSuccess(res, {}, "Cache busted");
  } catch (e) {
    next(e);
  }
}
