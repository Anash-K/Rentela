import prisma from "../libs/prisma.js";
import { redis } from "../libs/redis.js";
import { PRICING_CACHE_TTL_SEC } from "../config/env.js";

const CACHE_KEY = "pricing:activeRulePack:v1";

/**
 * Load active version + all tiers (DB).
 */
export async function loadActiveRulePackFromDb() {
  const now = new Date();
  const version = await prisma.autoPricingRuleVersion.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!version) {
    const err = new Error("No active auto-pricing rule version");
    err.code = "NO_ACTIVE_RULE_VERSION";
    throw err;
  }

  const tiers = await prisma.autoPricingTier.findMany({
    where: { ruleVersionId: version.id },
  });

  return { version, tiers };
}

async function readCache() {
  if (!redis) return null;
  try {
    const raw = await redis.get(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(payload) {
  if (!redis) return;
  try {
    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", PRICING_CACHE_TTL_SEC);
  } catch {
    // cache optional
  }
}

/** @returns {Promise<{ version: object; tiers: object[] }>} */
export async function getActiveRulePack() {
  const cached = await readCache();
  if (cached?.version?.id && cached?.tiers?.length) {
    return cached;
  }

  const pack = await loadActiveRulePackFromDb();
  await writeCache(pack);
  return pack;
}

export async function bustPricingCache() {
  if (!redis) return;
  try {
    await redis.del(CACHE_KEY);
  } catch {
    /* noop */
  }
}
