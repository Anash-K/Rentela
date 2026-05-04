import { classifyVehicle } from "../domain/classify.js";
import {
  calculateBookingPrice,
  calculateLateFee,
  countRentalDays,
  generateFinalBill,
} from "../domain/calculate.js";
import { roundMoney } from "../domain/money.js";
import { getActiveRulePack } from "./rule-version.service.js";
import { PRICING_QUOTE_MAX_DAYS } from "../config/env.js";

function groupTiersByKind(tiers) {
  /** @type {Record<string, typeof tiers>} */
  const map = {};
  for (const t of tiers) {
    const k = t.vehicleKind;
    if (!map[k]) map[k] = [];
    map[k].push(t);
  }
  return map;
}

export function tierToPricingVector(tier, vehicleId) {
  const base = Number(tier.basePricePerDay);
  const div = Math.max(1, Number(tier.hourlyFromDailyDivisor ?? 10));
  return {
    vehicleId: vehicleId ?? null,
    pricingTierId: tier.id,
    segmentLabel: tier.segmentLabel,
    basePricePerDay: roundMoney(base),
    baseKmPerDay: roundMoney(Number(tier.includedKmPerDay)),
    pricePerExtraKm: roundMoney(Number(tier.extraKmPrice)),
    weekendMultiplier: Number(tier.weekendMultiplier),
    hourlyPrice: Math.round(base / div),
    isCustom: false,
  };
}

/**
 * @param {{ id?: string; vehicleKind: string; engineCC?: number|null; loadCapacityKg?: number|null }} vehicle
 */
export async function computeQuoteForVehicle(vehicle, { startAt, endAt, estimatedDistanceKm = 0 }) {
  const days = countRentalDays(startAt, endAt);
  if (days > PRICING_QUOTE_MAX_DAYS) {
    const err = new Error(`Quote limited to ${PRICING_QUOTE_MAX_DAYS} days`);
    err.code = "QUOTE_TOO_LONG";
    throw err;
  }

  const { version, tiers } = await getActiveRulePack();
  const grouped = groupTiersByKind(tiers);
  const kind = vehicle.vehicleKind?.toUpperCase?.();
  const list = grouped[kind] || [];

  const tier = classifyVehicle(
    {
      vehicleKind: kind,
      engineCC: vehicle.engineCC,
      loadCapacityKg: vehicle.loadCapacityKg,
    },
    list,
  );

  const pricing = tierToPricingVector(tier, vehicle.id);

  const roll = calculateBookingPrice({
    startDate: startAt,
    endDate: endAt,
    totalKm: estimatedDistanceKm,
    pricing: {
      basePricePerDay: pricing.basePricePerDay,
      baseKmPerDay: pricing.baseKmPerDay,
      pricePerExtraKm: pricing.pricePerExtraKm,
      weekendMultiplier: pricing.weekendMultiplier,
    },
  });

  /** Immutable snapshot stored on booking */
  const pricingSnapshot = {
    schemaVersion: 1,
    pricingVersionLabel: version.versionLabel,
    pricingRuleVersionId: version.id,
    pricingTierId: tier.id,
    vehicleKind: kind,
    segmentLabel: tier.segmentLabel,
    pricedAt: new Date().toISOString(),
    inputs: {
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      estimatedDistanceKm,
    },
    rates: {
      basePricePerDay: pricing.basePricePerDay,
      baseKmPerDay: pricing.baseKmPerDay,
      pricePerExtraKm: pricing.pricePerExtraKm,
      weekendMultiplier: pricing.weekendMultiplier,
      hourlyPrice: pricing.hourlyPrice,
    },
    quoteBreakdown: roll,
  };

  return {
    pricingVersionLabel: version.versionLabel,
    pricingRuleVersionId: version.id,
    pricing,
    breakdown: roll,
    pricingSnapshot,
  };
}

export function computeFinalBillFromSnapshot(pricingSnapshot, { actualKm, actualEnd }) {
  const rates = pricingSnapshot?.rates;
  const inputs = pricingSnapshot?.inputs;
  if (!rates || !inputs?.startAt || !inputs?.endAt) {
    const err = new Error("Invalid pricing snapshot");
    err.code = "BAD_SNAPSHOT";
    throw err;
  }

  return generateFinalBill({
    pricing: {
      basePricePerDay: rates.basePricePerDay,
      baseKmPerDay: rates.baseKmPerDay,
      pricePerExtraKm: rates.pricePerExtraKm,
      weekendMultiplier: rates.weekendMultiplier,
      hourlyPrice: rates.hourlyPrice,
    },
    bookingWindow: { start: inputs.startAt, end: inputs.endAt },
    actualKm,
    actualEnd,
  });
}

export { calculateLateFee, generateFinalBill };
