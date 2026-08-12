import { z } from 'zod'

export const FuelReportFiltersSchema = z.object({
  days: z.coerce.number().int().positive().max(3650).default(365),
})
export type FuelReportFilters = z.infer<typeof FuelReportFiltersSchema>

export interface FuelReportEntry {
  date: string
  airportIdent: string
  airportName: string | null
  litres: number
  fuelType: string | null
  pricePerLitreEur: number | null
}

export interface FuelReportResponse {
  data: FuelReportEntry[]
}
