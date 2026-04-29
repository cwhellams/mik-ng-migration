import { z } from 'zod'
import { AuditableSchema } from '../../types/schema.ts'

// Aircraft card schema
export const AircraftCardSchema = z.object({
  cardId: z.number().optional(),
  aircraftRegistration: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(), // ISO date string
  validTo: z.string().nullable().optional(), // ISO date string
})

export type AircraftCard = z.infer<typeof AircraftCardSchema>

export const AircraftCardAuditableSchema = AuditableSchema.extend(AircraftCardSchema.shape)

export type AircraftCardAuditable = z.infer<typeof AircraftCardAuditableSchema>

// Filters for aircraft cards
export const AircraftCardFiltersSchema = z.object({
  aircraftRegistration: z.string().optional(),
  validOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
})

export type AircraftCardFilters = z.infer<typeof AircraftCardFiltersSchema>

// Response types
export interface AircraftCardListResponse {
  cards: AircraftCardAuditable[]
  total: number
}
