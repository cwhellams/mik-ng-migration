import { z } from 'zod'

export enum TraficomReportFilter {
  ALL = 'ALL',
  PRIVATE = 'PRIVATE',
  SCHOOL = 'SCHOOL',
  DTO_SCHOOL = 'DTO_SCHOOL',
  NON_DTO_SCHOOL = 'NON_DTO_SCHOOL',
}

export const TraficomReportFiltersSchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
  filter: z.nativeEnum(TraficomReportFilter).default(TraficomReportFilter.ALL),
})

export type TraficomReportFilters = z.infer<typeof TraficomReportFiltersSchema>

export interface TraficomReportEntry {
  aircraftRegistration: string
  // Counts/sums for the selected year + selected filter
  flights: number
  landings: number
  zzzzLandings: number
  // Selected-year totals (across all flight types, regardless of filter)
  yearTotalFlightMins: number
  yearTotalLandings: number
  // Lifetime totals (all-time, across all flight types, regardless of filter)
  lifetimeTotalFlightMins: number
  lifetimeTotalLandings: number
}

export interface TraficomReportResponse {
  data: TraficomReportEntry[]
  filters: TraficomReportFilters
}
