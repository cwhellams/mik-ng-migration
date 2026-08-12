import { z } from 'zod'
import { DateRangeSchema, withDateRangeCheck } from '../../types/schema.ts'

export const InstructorWorktimeFiltersSchema = withDateRangeCheck(
  DateRangeSchema.extend({
    timeType: z.enum(['block', 'air']).default('block'),
  }),
)

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
