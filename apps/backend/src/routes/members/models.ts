import { z } from 'zod'

export enum MIKRoles {
  USER = 'USER',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  COMMITTEE = 'COMMITTEE',
}

export enum MIKMemberTypes {
  FLYING = 'FLYING',
  NONFLYING = 'NONFLYING',
  JUNIOR = 'JUNIOR',
}

// member list endpoint

const MemberListSchema = z.object({
  name: z.string(),
  memberId: z.number(),
  phoneNumber: z.string().nullish(),
})

export type MemberList = z.infer<typeof MemberListSchema>

export const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// member details endpoint

export const MemberSchema = z.object({
  memberId: z.number(),
  memberType: z.nativeEnum(MIKMemberTypes),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),

  phoneNumber: z.string().nullish(),
  streetAddress: z.string().nullish(),
  postcode: z.string().nullish(),
  townCity: z.string().nullish(),

  iceContactName: z.string().nullish(),
  iceContactPhoneNumber: z.string().nullish(),

  isTrainingProgramPilot: z.boolean(),
  canMakeReservations: z.boolean(),
  billingId: z.string().nullish(),
  dateOfBirth: z.string().date().nullish(),
  memberSince: z.string().date(),

  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
  emailVerifiedAt: z.string().datetime().optional(),

  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type Member = z.infer<typeof MemberSchema>

// Limited number of member fields the user can edit, the rest are for admins only
export const MemberProfileSchema = MemberSchema.pick({
  email: true,
  firstName: true,
  lastName: true,

  phoneNumber: true,
  streetAddress: true,
  postcode: true,
  townCity: true,

  iceContactName: true,
  iceContactPhoneNumber: true,

  dateOfBirth: true,
})

export type MemberProfile = z.infer<typeof MemberProfileSchema>
export type MemberResponse = z.infer<typeof MemberSchema>

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
  message: "Time must be in format 'HH:MM:SS'",
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

const baseFlightLogSchema = z.object({
  aircraft_registration: z.string().max(10),
  arrival_airport: z.string().max(10),
  billable_member_id: z.number().int(),
  billing_remarks: z.string().nullish(),
  captain_member_id: z.number().int().nullish(),
  copilot_member_id: z.number().int().nullish(),
  captain: z.string().max(50),
  copilot: z.string().max(50).nullish(),
  departure_airport: z.string().max(10),
  flight_date: z.preprocess(val => (typeof val === 'string' ? new Date(val) : val), z.date()),
  flight_type: z.string().max(50).nonempty(),
  fuel_uplift_litres: z.number().positive().nullish(),
  instrument_hours: TimeSchema.nullish(),
  landing_time_utc: TimeSchema,
  night_hours: TimeSchema.nullish(),
  number_of_landings: z.number().int(),
  off_block_time_utc: TimeSchema,
  oil_uplift_litres: z.number().positive().nullish(),
  on_block_time_utc: TimeSchema,
  persons_on_board: z.number().int(),
  remarks: z.string().nullish(),
  takeoff_time_utc: TimeSchema,
})

export const FlightLogInsertSchema = baseFlightLogSchema.extend({
  created_by: z.string(),
  updated_by: z.string(),
})

export const FlightLogUpdateSchema = FlightLogInsertSchema.omit({
  created_by: true,
})

export const FlightLogResponseSchema = baseFlightLogSchema.extend({
  created_at: z.date(),
  created_by: z.string(),
  flight_id: z.number().int(),
  invoice_number: z.string().max(50).nullish(),
  is_billed: z.boolean(),
  updated_at: z.date(),
  updated_by: z.string(),
})

// Infer the TypeScript type from the Zod schema
export type FlightLog = z.infer<typeof FlightLogResponseSchema>
export type FlightLogInsertRequest = z.infer<typeof FlightLogInsertSchema>
export type FlightLogUpdateRequest = z.infer<typeof FlightLogUpdateSchema>
