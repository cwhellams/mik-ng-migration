import { z } from 'zod'

export const MileageAllowanceSchema = z.object({
  id: z.number().int(),
  taxYear: z.number().int(),
  ratePerKm: z.number().positive(),
  discountPct: z.number().min(0).max(100),
  effectiveRatePerKm: z.number().positive(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type MileageAllowance = z.infer<typeof MileageAllowanceSchema>

export const UpsertMileageAllowanceSchema = z.object({
  taxYear: z.number().int().min(2020).max(2100),
  ratePerKm: z.number().positive(),
  discountPct: z.number().min(0).max(100).default(50),
})
export type UpsertMileageAllowance = z.infer<typeof UpsertMileageAllowanceSchema>

// ─── Mileage detail (per expense claim) ──────────────────────────────────────

export const MileageDetailSchema = z.object({
  id: z.number().int().optional(),
  claimId: z.string().uuid().optional(),
  route: z.string().min(1).max(500),
  journeyDate: z.string().date(),
  distanceKm: z.number().positive(),
  passengers: z.array(z.string()).default([]),
  boardApproved: z.boolean().default(false),
  /** HETU is returned masked from the API; full value only goes in on write */
  hetu: z.string().optional(),
  ratePerKm: z.number().positive().optional(),
})
export type MileageDetail = z.infer<typeof MileageDetailSchema>

export const CreateMileageDetailSchema = MileageDetailSchema.omit({
  id: true,
  claimId: true,
  ratePerKm: true,
})
export type CreateMileageDetail = z.infer<typeof CreateMileageDetailSchema>
