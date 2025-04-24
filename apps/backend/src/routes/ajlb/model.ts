import { z } from 'zod'

export const postgresDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Invalid date format, expected YYYY-MM-DD',
})

export const flightAircraftJourneyLogBookFilter = z
  .object({
    aircraft_registration: z.string().optional(),
    to_date: postgresDate.optional(),
    seq_no: z.number().optional(),
    from_date: postgresDate.optional(),
  })
  .strict()
export type AjlbFilter = z.infer<typeof flightAircraftJourneyLogBookFilter>

export const flightAircraftJourneyLogBookSchema = z.object({
  aircraft_registration: z.string(),
  end_date: z.union([postgresDate, z.null()]),
  flight_time: z.string().readonly(),
  minutes_at_start: z.number(),
  no_of_pages: z.number(),
  rows_per_page: z.number(),
  seq_no: z.number(),
  start_date: postgresDate,
  start_page: z.number(),
})

export type FlightAircraftJourneyLogBook = z.infer<typeof flightAircraftJourneyLogBookSchema>
