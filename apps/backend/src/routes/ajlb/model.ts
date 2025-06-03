import { z } from 'zod'
import { BooleanSchema } from '../../types/schema.ts'

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
  pagesInUse: z.number().int().readonly(),
})

export type AircraftJourneyLogBook = z.infer<typeof AircraftJourneyLogBookSchema>

export const AjlbListResponseSchema = z.object({
  books: z.array(AircraftJourneyLogBookSchema),
})

export type AjlbListResponse = z.infer<typeof AjlbListResponseSchema>
