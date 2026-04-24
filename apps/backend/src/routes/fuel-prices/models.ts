import { z } from 'zod'

export const FuelPricesSchema = z.object({
  markdown: z.string().max(50000),
  renderedHtml: z.string(),
})

export type FuelPrices = z.infer<typeof FuelPricesSchema>

export const FuelPricesUpdateSchema = FuelPricesSchema.pick({
  markdown: true,
})

export type FuelPricesUpdate = z.infer<typeof FuelPricesUpdateSchema>
