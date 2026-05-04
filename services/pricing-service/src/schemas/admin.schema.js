import { z } from "zod";

const vehicleKindSchema = z.enum(["BIKE", "CAR", "ERICKSHAW", "TEMPO", "LOADER"]);

export const createRuleVersionSchema = z.object({
  versionLabel: z.string().min(1).max(120),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateRuleVersionSchema = z.object({
  versionLabel: z.string().min(1).max(120).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createTierSchema = z.object({
  vehicleKind: vehicleKindSchema,
  segmentLabel: z.string().min(1).max(120),
  sortOrder: z.number().int().optional().default(0),
  minEngineCc: z.number().int().nullable().optional(),
  maxEngineCc: z.number().int().nullable().optional(),
  capacityCeilingKg: z.number().int().positive().nullable().optional(),
  basePricePerDay: z.number().positive(),
  includedKmPerDay: z.number().nonnegative(),
  extraKmPrice: z.number().nonnegative(),
  weekendMultiplier: z.number().positive().optional().default(1.2),
  hourlyFromDailyDivisor: z.number().int().positive().optional().default(10),
});

export const updateTierSchema = createTierSchema.partial();
