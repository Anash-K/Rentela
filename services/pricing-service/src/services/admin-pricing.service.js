import prisma from "../libs/prisma.js";
import { bustPricingCache } from "./rule-version.service.js";

async function afterMutation() {
  await bustPricingCache();
}

export async function listRuleVersions() {
  const versions = await prisma.autoPricingRuleVersion.findMany({
    orderBy: { effectiveFrom: "desc" },
    include: {
      _count: { select: { tiers: true } },
    },
  });
  return versions.map((v) => ({
    id: v.id,
    versionLabel: v.versionLabel,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    isActive: v.isActive,
    notes: v.notes,
    createdAt: v.createdAt,
    tierCount: v._count.tiers,
  }));
}

export async function getRuleVersionWithTiers(id) {
  const version = await prisma.autoPricingRuleVersion.findUnique({
    where: { id },
    include: {
      tiers: { orderBy: [{ vehicleKind: "asc" }, { sortOrder: "asc" }] },
    },
  });
  return version;
}

export async function createRuleVersion(raw) {
  const version = await prisma.autoPricingRuleVersion.create({
    data: {
      versionLabel: raw.versionLabel,
      effectiveFrom: raw.effectiveFrom ?? new Date(),
      effectiveTo: raw.effectiveTo ?? null,
      isActive: raw.isActive ?? false,
      notes: raw.notes ?? null,
    },
  });
  await afterMutation();
  return version;
}

export async function updateRuleVersion(id, raw) {
  const version = await prisma.autoPricingRuleVersion.update({
    where: { id },
    data: {
      ...(raw.versionLabel !== undefined && { versionLabel: raw.versionLabel }),
      ...(raw.effectiveFrom !== undefined && { effectiveFrom: raw.effectiveFrom }),
      ...(raw.effectiveTo !== undefined && { effectiveTo: raw.effectiveTo }),
      ...(raw.isActive !== undefined && { isActive: raw.isActive }),
      ...(raw.notes !== undefined && { notes: raw.notes }),
    },
  });
  await afterMutation();
  return version;
}

export async function deleteRuleVersion(id) {
  await prisma.autoPricingRuleVersion.delete({
    where: { id },
  });
  await afterMutation();
}

export async function createTier(ruleVersionId, raw) {
  const tier = await prisma.autoPricingTier.create({
    data: {
      ruleVersionId,
      vehicleKind: raw.vehicleKind,
      segmentLabel: raw.segmentLabel,
      sortOrder: raw.sortOrder ?? 0,
      minEngineCc: raw.minEngineCc ?? null,
      maxEngineCc: raw.maxEngineCc ?? null,
      capacityCeilingKg: raw.capacityCeilingKg ?? null,
      basePricePerDay: raw.basePricePerDay,
      includedKmPerDay: raw.includedKmPerDay,
      extraKmPrice: raw.extraKmPrice,
      weekendMultiplier: raw.weekendMultiplier ?? 1.2,
      hourlyFromDailyDivisor: raw.hourlyFromDailyDivisor ?? 10,
    },
  });
  await afterMutation();
  return tier;
}

export async function updateTier(tierId, raw) {
  const tier = await prisma.autoPricingTier.update({
    where: { id: tierId },
    data: {
      ...(raw.vehicleKind !== undefined && { vehicleKind: raw.vehicleKind }),
      ...(raw.segmentLabel !== undefined && { segmentLabel: raw.segmentLabel }),
      ...(raw.sortOrder !== undefined && { sortOrder: raw.sortOrder }),
      ...(raw.minEngineCc !== undefined && { minEngineCc: raw.minEngineCc }),
      ...(raw.maxEngineCc !== undefined && { maxEngineCc: raw.maxEngineCc }),
      ...(raw.capacityCeilingKg !== undefined && {
        capacityCeilingKg: raw.capacityCeilingKg,
      }),
      ...(raw.basePricePerDay !== undefined && {
        basePricePerDay: raw.basePricePerDay,
      }),
      ...(raw.includedKmPerDay !== undefined && {
        includedKmPerDay: raw.includedKmPerDay,
      }),
      ...(raw.extraKmPrice !== undefined && { extraKmPrice: raw.extraKmPrice }),
      ...(raw.weekendMultiplier !== undefined && {
        weekendMultiplier: raw.weekendMultiplier,
      }),
      ...(raw.hourlyFromDailyDivisor !== undefined && {
        hourlyFromDailyDivisor: raw.hourlyFromDailyDivisor,
      }),
    },
  });
  await afterMutation();
  return tier;
}

export async function deleteTier(tierId) {
  await prisma.autoPricingTier.delete({
    where: { id: tierId },
  });
  await afterMutation();
}

/**
 * Makes `id` the only active version (others deactivated).
 */
export async function activateRuleVersion(id) {
  await prisma.$transaction(async (tx) => {
    await tx.autoPricingRuleVersion.updateMany({
      data: { isActive: false },
    });
    await tx.autoPricingRuleVersion.update({
      where: { id },
      data: { isActive: true },
    });
  });
  await afterMutation();
}
