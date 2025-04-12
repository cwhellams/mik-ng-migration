import { z } from 'zod'

export const AircraftMaintenanceSchema = z.object({
  engineTBOCycle: z.number().int(),
  propTBOCycle: z.number().int(),
  lastEngineOverhaulTach: z.number().int().positive(),
  lastPropOverhaulTach: z.number().int().positive(),

  lastAnnualDate: z.string().date(),
  nextAnnualDate: z.string().date(),

  maintenanceCycle: z.number().int(),

  lastMaintenanceDate: z.string().date().nullable(),
  lastMaintenanceType: z.string(),
  lastMaintenanceTach: z.number().int().positive(),

  nextMaintenanceDate: z.string().date().nullable(),
  nextMaintenanceType: z.string(),
  nextMaintenanceTach: z.number().int().positive(),

  totalPercentageHours: z.number().int().positive(),
  usablePercentageHours: z.number().int().positive(),
})

export enum Severity {
  warning,
  caution,
  note,
}

export const AircraftNoteSchema = z.object({
  text: z.string(),
  severity: z.nativeEnum(Severity),
  enabled: z.boolean(),
})

export const AircraftSchema = z.object({
  registration: z.string().max(10).nonempty(),
  displayName: z.string().max(50).nonempty(),
  model: z.string().max(50).nonempty(),
  manufacturer: z.string().max(50).nonempty(),
  yearOfManufacture: z.number().int().positive(),

  maintenance: AircraftMaintenanceSchema,

  notes: z.array(AircraftNoteSchema),

  location: z.string().nullable(),
  equipment: z.string().nullable(),

  hourlyRateEur: z.number(),

  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

// Allow only subset of fields for new aircraft
export const AircraftInsertSchema = AircraftSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
})

// We use partial to allow only updating some fields
export const AircraftUpdateSchema = AircraftInsertSchema.partial().strict()

// Infer the TypeScript types from the Zod schemas
export type Aircraft = z.infer<typeof AircraftSchema>
export type AircraftStatus = z.infer<typeof AircraftStatusSchema>
export type AircraftInsertRequest = z.infer<typeof AircraftInsertSchema>
export type AircraftUpdateRequest = z.infer<typeof AircraftUpdateSchema>

export const AircraftListResponseSchema = z.object({
  aircrafts: z.array(AircraftSchema),
})

export type AircraftListResponse = z.infer<typeof AircraftListResponseSchema>
