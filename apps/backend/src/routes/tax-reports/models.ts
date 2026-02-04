import { z } from 'zod'

export const TaxReportFiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

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
