import { z } from 'zod'

// Aircraft Pricing Schemas
export const AircraftPricingSchema = z.object({
  registration: z.string().max(10),
  valid_from: z.string().date(), // 'YYYY-MM-DD' format from PG DATE
  valid_to: z.string().date().nullable(),
  price_per_min: z.number(), // numeric from PG converted to number
  created_at: z.string().datetime(),
  created_by: z.string().max(9).nullable(),
  updated_at: z.string().datetime().nullable(),
  updated_by: z.string().max(9).nullable(),
  notes: z.string().nullable(),
})

export type AircraftPricing = z.infer<typeof AircraftPricingSchema>

export const CreateAircraftPricingSchema = z.object({
  registration: z.string().max(10),
  valid_from: z.string().date(),
  valid_to: z.string().date().nullable().optional(),
  price_per_min: z.number().positive(),
  created_by: z.string().max(9).optional(),
  notes: z.string().optional(),
})

export type CreateAircraftPricing = z.infer<typeof CreateAircraftPricingSchema>

export const UpdateAircraftPricingSchema = z.object({
  valid_to: z.string().date().nullable().optional(),
  price_per_min: z.number().positive().optional(),
  updated_by: z.string().max(9).optional(),
  notes: z.string().optional(),
})

export type UpdateAircraftPricing = z.infer<typeof UpdateAircraftPricingSchema>

export const AircraftPricingFiltersSchema = z.object({
  registration: z.string().max(10).optional(),
  fromDate: z.string().date().optional(), // Filter pricing valid from this date onwards
  toDate: z.string().date().optional(), // Filter pricing valid up to this date
})

export type AircraftPricingFilters = z.infer<typeof AircraftPricingFiltersSchema>

export const AircraftPricingListResponseSchema = z.object({
  pricing: z.array(AircraftPricingSchema),
})

export type AircraftPricingListResponse = z.infer<typeof AircraftPricingListResponseSchema>
