import { z } from "zod";

export const paymentCompletedEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  correlationId: z.string().min(1),
  eventId: z.string().optional(),
  paymentId: z.string().min(1),
  bookingId: z.string().min(1),
  userId: z.string().min(1),
  amount: z.coerce.number().finite(),
  currency: z.string().min(1).max(8),
  totalAmount: z.coerce.number().finite(),
  breakdown: z.any().nullable().optional(),
  billCurrency: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});
