import { z } from 'zod'

export const UpliftReportFiltersSchema = z.object({
  aircraftRegistration: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type UpliftReportFilters = z.infer<typeof UpliftReportFiltersSchema>

export interface UpliftReportEntry {
  flightId: string
  offBlockTimeUtc: string
  picName: string
  fuelUpliftLitres: number | null
  oilUpliftLitres: number | null
}

export interface UpliftReportSummary {
  totalFuelUpliftLitres: number
  totalOilUpliftLitres: number
  fuelTypes: string[]
}

export interface UpliftReportResponse {
  data: UpliftReportEntry[]
  summary: UpliftReportSummary
  filters: UpliftReportFilters
}
