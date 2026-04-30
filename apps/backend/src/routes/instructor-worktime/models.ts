import { z } from 'zod'

export const InstructorWorktimeFiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
