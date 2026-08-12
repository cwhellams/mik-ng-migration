import { z } from 'zod'
import { AuditableSchema, LimitOffsetSchema } from './schema.ts'

// Aircraft card schema
export const AircraftCardSchema = z.object({
  cardId: z.number().optional(),
  aircraftRegistration: z.string().min(1).max(10),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
})

export type AircraftCard = z.infer<typeof AircraftCardSchema>

// Schema for PATCH requests — only mutable fields; cardId and aircraftRegistration are not updatable
export const AircraftCardPatchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
})

export type AircraftCardPatch = z.infer<typeof AircraftCardPatchSchema>

export const AircraftCardAuditableSchema = AuditableSchema.extend(AircraftCardSchema.shape)

export type AircraftCardAuditable = z.infer<typeof AircraftCardAuditableSchema>

// Filters for aircraft cards
export const AircraftCardFiltersSchema = z
  .object({
    aircraftRegistration: z.string().optional(),
    validOnly: z.coerce.boolean().optional(),
  })
  .merge(LimitOffsetSchema(100))

export type AircraftCardFilters = z.infer<typeof AircraftCardFiltersSchema>

// Response types
export interface AircraftCardListResponse {
  cards: AircraftCardAuditable[]
  total: number
}
