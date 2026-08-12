import type { z } from 'zod'
import { DateRangeSchema, withDateRangeCheck } from './schema.ts'

export const TaxReportFiltersSchema = withDateRangeCheck(DateRangeSchema)

export type TaxReportFilters = z.infer<typeof TaxReportFiltersSchema>

export interface TaxReportEntry {
  month: string // Format: YYYY-MM
  aircraftRegistration: string
  commercialBlockMins: number
  commercialFlightMins: number
  privateBlockMins: number
  privateFlightMins: number
  totalBlockMins: number
  totalFlightMins: number
}

export interface TaxReportResponse {
  data: TaxReportEntry[]
  filters: TaxReportFilters
}
