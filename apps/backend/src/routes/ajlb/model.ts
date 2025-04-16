import { z } from 'zod'

export const flightAircraftJourneyLogBookFilter = z
  .object({
    aircraft_registration: z.string().optional(),
    to_date: z.union([z.coerce.date().optional(), z.null()]), // ISO8601 or null
    seq_no: z.number().optional(),
    from_date: z.coerce.date().optional(),
  })
  .strict()
export type AjlbFilter = z.infer<typeof flightAircraftJourneyLogBookFilter>

export const flightAircraftJourneyLogBookSchema = z.object({
  aircraft_registration: z.string(),
  end_date: z.union([z.coerce.date().optional(), z.null()]), // ISO8601 or null
  flight_time: z.union([z.string(), z.null()]), // Could coerce to number/time if needed
  minutes_at_start: z.number(),
  no_of_pages: z.number(),
  rows_per_page: z.number(),
  seq_no: z.number(),
  start_date: z.coerce.date(), // ISO8601
  start_page: z.number(),
})

export type FlightAircraftJourneyLogBook = z.infer<typeof flightAircraftJourneyLogBookSchema>
