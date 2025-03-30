import { z } from 'zod'

const Numeric = z.union([z.number(), z.string()])
const Timestamp = z.union([z.date(), z.string()])

export const baseAircraftSchema = z.object({
  registration: z.string().max(10).nonempty(),
  display_name: z.string().max(50).nonempty(),
  model: z.string().max(50).nonempty(),
  manufacturer: z.string().max(50).nonempty(),
  year_of_manufacture: z.number().int().positive(),
  total_hours: Numeric,
  engine_tbo_hours: z.number().int().positive(),
  prop_tbo_hours: z.number().int().positive(),
  hours_at_last_engine_overhaul: Numeric,
  hours_at_last_prop_overhaul: Numeric,
  engine_hours_remaining_before_tbo: Numeric.nullable(),
  prop_hours_remaining_before_tbo: Numeric.nullable(),
  last_annual: Timestamp.nullable(),
  next_annual: Timestamp.nullable(),
  last_100hr: Timestamp.nullable(),
  last_50hr: Timestamp.nullable(),
  last_100hr_tach: Numeric.nullable(),
  next_100hr_tach: Numeric.nullable(),
  last_50hr_tach: Numeric.nullable(),
  next_50hr_tach: Numeric.nullable(),
  insurance_cert_expiry: Timestamp.nullable(),
  radio_cert_expiry: Timestamp.nullable(),
  transponder_cert_expiry: Timestamp.nullable(),
  elt_cert_expiry: Timestamp.nullable(),
  gps_cert_expiry: Timestamp.nullable(),
  harness_expiry: Timestamp.nullable(),
  equipment: z.string().nullable(),
  hourly_rate_eur: Numeric,
  created_by: z.string().nonempty(),
  updated_by: z.string().nonempty(),
})

export const AircraftInsertSchema = baseAircraftSchema

export const AircraftResponseSchema = baseAircraftSchema.extend({
  created_at: Timestamp,
  updated_at: Timestamp,
})

// We use partial to allow only updating some fields
export const AircraftUpdateSchema = baseAircraftSchema
  .omit({
    created_by: true,
  })
  .partial()
  .strict()

// Infer the TypeScript types from the Zod schemas
export type Aircraft = z.infer<typeof AircraftResponseSchema>
export type AircraftInsertRequest = z.infer<typeof AircraftInsertSchema>
export type AircraftUpdateRequest = z.infer<typeof AircraftUpdateSchema>
