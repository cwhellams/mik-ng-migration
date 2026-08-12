import { z } from 'zod'
import { DateRangeSchema, withDateRangeCheck } from '../../types/schema.ts'

export const UpliftReportFiltersSchema = withDateRangeCheck(
  DateRangeSchema.extend({
    aircraftRegistration: z.string().min(1),
  }),
)

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
