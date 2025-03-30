import { z } from 'zod'

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
  message: "Time must be in format 'HH:MM'",
})

export const flightLogFiltersSchema = z.object({
  flight_id: z.coerce.number().optional(), // Converts string to number
  member_id: z.coerce.number().optional(), // Converts string to number
  captain: z.string().optional(),
  copilot: z.string().optional(),
  aircraft_registration: z.string().optional(),
  startDate: z.coerce.date().optional(), // Converts string to Date
  endDate: z.coerce.date().optional(),
})

// Type inference from the schema (should match your interface)
export type FlightLogFilters = z.infer<typeof flightLogFiltersSchema>

// const baseFlightLogSchema = z.object({
//   aircraft_registration: z.string().max(10),
//   arrival_airport: z.string().max(10),
//   billable_member_id: z.number().int(),
//   billing_remarks: z.string().nullish(),
//   captain_member_id: z.number().int().nullish(),
//   copilot_member_id: z.number().int().nullish(),
//   captain: z.string().max(50),
//   copilot: z.string().max(50).nullish(),
//   departure_airport: z.string().max(10),
//   flight_date: z.string().date(),
//   flight_type: z.string().max(50).nonempty(),
//   fuel_uplift_litres: z.number().positive().nullish(),
//   instrument_hours: TimeSchema.nullish(),
//   landing_time_utc: TimeSchema,
//   night_hours: TimeSchema.nullish(),
//   number_of_landings: z.number().int(),
//   off_block_time_utc: TimeSchema,
//   oil_uplift_litres: z.number().positive().nullish(),
//   on_block_time_utc: TimeSchema,
//   persons_on_board: z.number().int(),
//   remarks: z.string().nullish(),
//   takeoff_time_utc: TimeSchema,
//   created_by: z.string(),
//   updated_by: z.string(),
// })

const Numeric = z.union([z.number(), z.string()])
const Timestamp = z.union([z.date(), z.string()])

export const baseFlightLogSchema = z.object({
  aircraft_registration: z.string().nonempty(),
  arrival_airport: z.string().nonempty(),
  billable_member_id: z.number().int(),
  billing_remarks: z.string().nullable(),
  captain: z.string().nonempty(),
  captain_member_id: z.number().int().nullable(),
  copilot: z.string().nullable(),
  copilot_member_id: z.number().int().nullable(),
  created_by: z.number().int(),
  departure_airport: z.string().nonempty(),
  //flight_id: z.number(),
  flight_type: z.string(),
  fuel_uplift_litres: Numeric.nullable(),
  instrument_hours: TimeSchema.nullish(),
  //invoice_number: z.string().nullable(),
  is_billable_flight: z.boolean(),
  //is_billed: z.boolean(),
  landing_time_utc: Timestamp,
  night_hours: TimeSchema.nullish(),
  non_billing_approved_by_member_id: z.number().nullable(),
  non_billing_reason: z.string().nullable(),
  number_of_landings: z.number().int().positive(),
  off_block_time_utc: Timestamp,
  oil_uplift_litres: Numeric.nullable(),
  on_block_time_utc: Timestamp,
  persons_on_board: z.number().int().positive(),
  remarks: z.string().nullable(),
  takeoff_time_utc: Timestamp,
  //updated_at: Timestamp,
  updated_by: z.number(),
})

export const FlightLogInsertSchema = baseFlightLogSchema

// We use partial to allow only updating some fields
export const FlightLogUpdateSchema = FlightLogInsertSchema.omit({
  created_by: true,
})
  .extend({
    updated_at: Timestamp,
  })
  .partial()
  .strict()

export const FlightLogResponseSchema = baseFlightLogSchema.extend({
  created_at: Timestamp,
  flight_id: z.number().int(),
  invoice_number: z.string().max(50).nullish(),
  is_billed: z.boolean(),
  updated_at: Timestamp,
})

// Infer the TypeScript type from the Zod schema
export type FlightLog = z.infer<typeof FlightLogResponseSchema>
export type FlightLogInsertRequest = z.infer<typeof FlightLogInsertSchema>
export type FlightLogUpdateRequest = z.infer<typeof FlightLogUpdateSchema>
