import { z } from 'zod'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'

dayjs.extend(customParseFormat)

const strictDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(val => dayjs(val, 'YYYY-MM-DD', true).isValid(), {
    message: 'Invalid calendar date',
  })

export const InstructorWorktimeFiltersSchema = z.object({
  startDate: strictDate,
  endDate: strictDate,
  timeType: z.enum(['block', 'air']).default('block'),
})

export type InstructorWorktimeFilters = z.infer<typeof InstructorWorktimeFiltersSchema>

export interface InstructorWorktimeEntry {
  instructorMemberId: string
  instructorName: string
  date: string // YYYY-MM-DD
  flightCount: number
  totalTimeMins: number // block or air time depending on filter
  workTimeMins: number // totalTimeMins + 60 min before + 30 min after per flight
}

export interface InstructorWorktimeResponse {
  data: InstructorWorktimeEntry[]
  filters: InstructorWorktimeFilters
}
