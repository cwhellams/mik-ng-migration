import { z } from 'zod'
import { FUEL_TYPES } from './expenses.ts'

export const FuelPricesSchema = z.object({
  markdown: z.string().max(50000),
  renderedHtml: z.string(),
})

export type FuelPrices = z.infer<typeof FuelPricesSchema>

export const FuelPricesUpdateSchema = FuelPricesSchema.pick({
  markdown: true,
})

export type FuelPricesUpdate = z.infer<typeof FuelPricesUpdateSchema>

// ─── Local (EFNU) fuel price cap, per fuel type (issue #955) ────────────────────

export const LocalFuelPriceSchema = z.object({
  id: z.number().int(),
  fuelType: z.enum(FUEL_TYPES),
  priceEurPerLitre: z.number().positive(),
  validFrom: z.string().date(),
  createdBy: z.string(),
  createdAt: z.string(),
})
export type LocalFuelPrice = z.infer<typeof LocalFuelPriceSchema>

export const UpsertLocalFuelPriceSchema = z.object({
  fuelType: z.enum(FUEL_TYPES),
  priceEurPerLitre: z.number().positive(),
  validFrom: z.string().date(),
})
export type UpsertLocalFuelPrice = z.infer<typeof UpsertLocalFuelPriceSchema>
