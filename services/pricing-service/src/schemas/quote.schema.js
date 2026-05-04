import { z } from "zod";

export const quoteBookingSchema = z.object({
  vehicle: z.object({
    id: z.string().uuid().optional(),
    vehicleKind: z.enum(["BIKE", "CAR", "ERICKSHAW", "TEMPO", "LOADER"]),
    engineCC: z.number().int().positive().optional().nullable(),
    loadCapacityKg: z.number().int().nonnegative().optional().nullable(),
  }),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  estimatedDistanceKm: z.number().nonnegative().optional().default(0),
});

export const finalBillSchema = z.object({
  pricingSnapshot: z.any(),
  actualKm: z.number().nonnegative(),
  actualEnd: z.coerce.date(),
});
