import { z } from 'zod'

export const AircraftJourneyLogBookFilter = z
  .object({
    seqNo: z.number().optional(),
    aircraftRegistration: z.string().optional(),
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
  })
  .strict()
export type AjlbFilter = z.infer<typeof AircraftJourneyLogBookFilter>

export const AircraftJourneyLogBookSchema = z.object({
  seqNo: z.number(),
  aircraftRegistration: z.string(),
  minutesAtStart: z.number(),
  noOfPages: z.number(),
  rowsPerPage: z.number(),
  startPage: z.number(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  flightTime: z.string().readonly(),
})

export type AircraftJourneyLogBook = z.infer<typeof AircraftJourneyLogBookSchema>
