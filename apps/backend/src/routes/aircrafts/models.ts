import { z } from 'zod'

import { AuditableSchema, BooleanSchema } from '../../types/schema.ts'
import { AircraftDocumentSchema } from '../aircraft-documents/models.ts'

export const AircraftMaintenanceRecordSchema = z.object({
  maintenanceCycle: z.number().int(),

  lastMaintenanceDate: z.string().date(),
  lastMaintenanceType: z.string(),
  lastMaintenanceMins: z.number().int(),

  nextMaintenanceDate: z.string().date().nullable(),
  nextMaintenanceType: z.string(),
  nextMaintenanceMins: z.number().int(),

  totalPercentageHours: z.number().int(),
  reservedHours: z.number().int(),
})

export enum Severity {
  warning = 'warning',
  caution = 'caution',
  note = 'note',
  off = 'off',
}

export enum FuelType {
  AVGAS = 'AVGAS',
  MOGAS = 'MOGAS',
  'JETA-1' = 'JETA-1',
}

export const AircraftNoteSchema = z.object({
  text: z.string(),
  severity: z.nativeEnum(Severity),
})

export type AircraftNote = z.infer<typeof AircraftNoteSchema>

export const AircraftAlertSchema = z.object({
  documentId: z.number().optional(),
  description: z.string(),
  untilExpiration: z.number().int(),
  hardLimit: z.number().int().nullable(),
  softLimit: z.number().int().nullable(),
})

export type AircraftAlert = z.infer<typeof AircraftAlertSchema>

export const AircraftStatusSchema = z.object({
  totalTime: z.string().optional(),
  lastLandingTimeUtc: z.string().date().optional(),
  lastLandingAirport: z.string().optional(),
  remainingFuelLitres: z.number().optional(),

  daysUntilNextMaintenance: z.number().int().optional(),
  minsUntilNextMaintenance: z.number().int(),
  usableMins: z.number().int(),

  warnings: z.array(AircraftAlertSchema),
  cautions: z.array(AircraftAlertSchema),
})

export type AircraftStatus = z.infer<typeof AircraftStatusSchema>

export const AircraftSchema = AuditableSchema.extend({
  registration: z.string().max(10).nonempty(),
  displayName: z.string().max(50).nonempty(),
  model: z.string().max(50).nonempty(),
  manufacturer: z.string().max(50).nonempty(),
  yearOfManufacture: z.number().int().positive(),
  seats: z.number().int().positive(),
  usableFuelLitres: z.number().int().positive(),
  fuelTypes: z.array(z.nativeEnum(FuelType)),
  active: z.boolean(),
  hidden: z.boolean(),

  status: AircraftStatusSchema.optional(),

  maintenance: AircraftMaintenanceRecordSchema,
  documents: z.array(AircraftDocumentSchema),

  notes: z.array(AircraftNoteSchema),

  location: z.string().nullable(),
  equipment: z.string().nullable(),

  hourlyRateEur: z.number().readonly().optional(),
  imageUrl: z.string().url().optional().nullable(),
})

export type Aircraft = z.infer<typeof AircraftSchema>

export const AircraftListResponseSchema = z.object({
  aircrafts: z.array(AircraftSchema),
})

export type AircraftListResponse = z.infer<typeof AircraftListResponseSchema>

export const AircraftFiltersSchema = z
  .object({
    activeOnly: BooleanSchema.optional(),
    visibleOnly: BooleanSchema.optional(),
  })
  .strict()

export type AircraftFilters = z.infer<typeof AircraftFiltersSchema>
