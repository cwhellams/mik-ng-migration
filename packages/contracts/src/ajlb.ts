import { z } from 'zod'
import { AuditableSchema, BooleanSchema } from './schema.ts'

export const AircraftJourneyLogBookFilterSchema = z
  .object({
    seqNo: z.number().optional(),
    aircraftRegistration: z.string().optional(),
    current: BooleanSchema.optional(),
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
  })
  .strict()
export type AjlbFilter = z.infer<typeof AircraftJourneyLogBookFilterSchema>

export const FlightTimeTotalsViewSchema = z.object({
  lastPage: z.number().int().readonly(),
  newFlightsPage: z.number().int().readonly().nullable(),
  newFlightsCount: z.number().int().readonly(),
  newFlightsTime: z.string().readonly(),
  validatedFlightsCount: z.number().int().readonly(),
  validatedFlightsTime: z.string().readonly(),
  validatedBeforeUTC: z.string().datetime().readonly().nullable(),
  verifiedTotalFlightTime: z.string().readonly(),
  unverifiedTotalFlightTime: z.string().readonly(),
  validatedTotalLandings: z.number().int().readonly(),
  totalLandings: z.number().int().readonly(),
})

export const AircraftJourneyLogBookSchema = AuditableSchema.extend({
  seqNo: z.number(),
  aircraftRegistration: z.string(),
  startFlightMins: z.number(),
  startFlightTime: z.string().readonly().optional(),
  startLandings: z.number().int().min(0),
  noOfPages: z.number(),
  rowsPerPage: z.number(),
  startPage: z.number(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  view: FlightTimeTotalsViewSchema.optional(),
})

export type AircraftJourneyLogBook = z.infer<typeof AircraftJourneyLogBookSchema>

export const AjlbListResponseSchema = z.object({
  books: z.array(AircraftJourneyLogBookSchema),
})

export type AjlbListResponse = z.infer<typeof AjlbListResponseSchema>

export const AircraftLandingsBaselineSchema = AuditableSchema.extend({
  aircraftRegistration: z.string(),
  baselineLandings: z.number().int().min(0),
})

export type AircraftLandingsBaseline = z.infer<typeof AircraftLandingsBaselineSchema>

export const AircraftLandingsBaselineResponseSchema = z.object({
  baseline: AircraftLandingsBaselineSchema.optional(),
})

export type AircraftLandingsBaselineResponse = z.infer<
  typeof AircraftLandingsBaselineResponseSchema
>
