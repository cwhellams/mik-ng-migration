import type { Insertable, Updateable } from 'kysely'
import { z } from 'zod'

import type { FlightLogs } from '../../db/schema.js'

const Numeric = z.union([z.number(), z.string()])

export const CrewRoleEnum = z.enum(['FE', 'FI', 'OBS', 'PIC', 'STU'])
export const PrivOrComFlightEnum = z.enum(['P', 'C'])
export const FlightLogStatusEnum = z.enum(['INVOICED', 'NEW', 'PAID', 'VALIDATED'])

const epochDateTime = z.preprocess(
  val => {
    if (typeof val === 'string' && /^-?\d+$/.test(val)) {
      return BigInt(val)
    }
    if (typeof val === 'number' && Number.isInteger(val)) {
      return BigInt(val)
    }
    return val // let z.bigint() handle the failure
  },
  z.bigint({
    required_error: 'This field is required',
    invalid_type_error: 'Must be a valid epoch time in seconds',
  }),
)

const bigintAsString = z.string().regex(/^\d+$/)

export const flightLogFiltersSchema = z
  .object({
    flight_id: z.string().optional(),
    billable_member_id: z.string().optional(),
    aircraft_registration: z.string().optional(),
    pic: z.string().optional(),
    crew2: z.string().optional(),
    crew3: z.string().optional(),
    crew4: z.string().optional(),
    startDate: epochDateTime.optional(),
    endDate: epochDateTime.optional(),
    last: z
      .enum(['true', 'false'])
      .nullish()
      .transform(v => v === 'true')
      .optional(),
  })
  .strict()

// Type inference from the schema (should match your interface)
export type FlightLogFilters = z.infer<typeof flightLogFiltersSchema>

export const baseFlightLogSchema = z.object({
  aircraft_registration: z.string(),
  ajlb_blank_rows_before: z.number().int().min(0),
  ajlb_seq_no: z.number().int().positive(),
  arrival_airport: z.string(),
  billable_member_id: z.string(),
  billing_remarks: z.string().nullable(), // string | null
  block_mins: z.number().int().nullable().optional(), // Generated<number | null>
  block_time: z.string().nullable().optional(), // Generated<string | null>
  created_at: z.date().optional(), // Generated<Timestamp> (assuming JS Date)
  created_by: z.string(),
  crew2_member_id: z.string().nullable().optional(),
  crew2_role: CrewRoleEnum.nullable().optional(),
  crew3_member_id: z.string().nullable().optional(),
  crew3_role: CrewRoleEnum.nullable().optional(),
  crew4_member_id: z.string().nullable().optional(),
  crew4_role: CrewRoleEnum.nullable().optional(),
  departure_airport: z.string(),
  flight_id: z.string().optional(), // Generated<number>
  flight_mins: z.number().int().nullable().optional(), // Generated<number | null>
  flight_time: z.string().nullable().optional(), // Generated<string | null>
  flight_type: z.string(),
  fuel_remaining_litres: z.number().positive(), // Numeric (required)
  fuel_uplift_litres: z.number().positive(), // Numeric (required)
  incident_or_observations: z.string().nullable(),
  instrument_flying_mins: z.number().int().min(0), // number (required)
  invoice_number: z.string().nullable().optional(), // Generated<string | null>
  is_billable_flight: z.boolean(), // boolean (required)
  is_dto_training_flight: z.boolean().optional(),
  is_billed: z.boolean().optional(), // Generated<boolean>
  landing_time_utc: z.date().nullable().optional(), // Generated<Timestamp | null>
  night_flying_mins: z.number().int().min(0), // number (required)
  non_billing_approved_by_member_id: z.string().nullable(),
  non_billing_reason: z.string().nullable(), // string | null
  number_of_landings: z.number().int(),
  off_block_time_utc: z.date().nullable().optional(), // Generated<Timestamp | null>
  oil_uplift_litres: Numeric, // Numeric (required)
  off_block_time_epoch: bigintAsString.optional(), // Int8 (required)
  takeoff_time_epoch: bigintAsString.optional(), // Int8 (required)// on_block_time_epoch: bigintAsString.optional(), // Int8 (required)
  landing_time_epoch: bigintAsString.optional(), // Int8 (required)
  on_block_time_epoch: bigintAsString.optional(), // Int8 (required)
  on_block_time_utc: z.date().nullable().optional(), // Generated<Timestamp | null>
  personal_remarks: z.string().nullable(),
  persons_on_board: z.number().int(),
  pic_member_id: z.string(),
  pic_role: CrewRoleEnum, // CrewRole (required)
  priv_or_com_flight: z.string(),
  status: FlightLogStatusEnum.optional(), // Generated<FlightLogStatus>
  takeoff_time_utc: z.date().nullable().optional(), // Generated<Timestamp | null>
  total_time_in_service: Numeric, // Numeric (required)
  updated_at: z.date().optional(), // Generated<Timestamp>
  updated_by: z.string(),
})

// We use partial to allow only updating some fields
export const flightLogInsertSchema = baseFlightLogSchema
  .omit({
    created_by: true,
    created_at: true,
    updated_by: true,
    updated_at: true,
    non_billing_approved_by_member_id: true,
    status: true,
    invoice_number: true,
    is_billed: true,
    takeoff_time_utc: true,
    landing_time_utc: true,
    off_block_time_utc: true,
    on_block_time_utc: true,
    flight_time: true,
    block_time: true,
    flight_mins: true,
    block_mins: true,
  })
  .extend({
    flight_id: z.string(),
    off_block_time_epoch: bigintAsString,
    takeoff_time_epoch: bigintAsString,
    landing_time_epoch: bigintAsString,
    on_block_time_epoch: bigintAsString,
  })

export const flightLogUpdateSchema = flightLogInsertSchema.partial().strict()

// Infer the TypeScript type from the Zod schema
export type FlightLog = z.infer<typeof baseFlightLogSchema>
export type FlightLogInsertRequest = z.infer<typeof flightLogInsertSchema>
export type FlightLogUpdateRequest = z.infer<typeof flightLogUpdateSchema>

export type InsertableFlightLog = Insertable<FlightLogs>
export type FlightLogUpdateable = Updateable<FlightLogs>

export const FlightVwFlightTimeTotalsSchema = z.object({
  ac_total_flight_time: z.string().nullable(),
  aircraft_registration: z.string().nullable(),
  ajlb_seq_no: z.number().int().nullable(),
  flight_log_mins_this_ajlb: z.number().int().nullable(),
  flight_time_this_ajlb: z.string().nullable(),
  total_flight_mins_at_ajlb_start: z.number().int().nullable(),
  total_flight_time_at_ajlb_start: z.string().nullable(),
})

export type FlightVwFlightTimeTotals = z.infer<typeof FlightVwFlightTimeTotalsSchema>
