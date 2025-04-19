import { z } from 'zod'

export const AircraftMaintenanceRecordSchema = z.object({
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
  warning = 'warning',
  caution = 'caution',
  note = 'note',
}

export const AircraftNoteSchema = z.object({
  text: z.string(),
  severity: z.nativeEnum(Severity),
  enabled: z.boolean(),
})

export type AircraftNote = z.infer<typeof AircraftNoteSchema>

export const AircraftDocumentsSchema = z.object({
  documentId: z.string(),
  description: z.string(),
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
  alertDaysBefore: z.number().int().nullable(),
  softLimit: z.number().int().nullable(),
  hardLimit: z.number().int().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
  updatedBy: z.string(),
})

export type AircraftDocument = z.infer<typeof AircraftDocumentsSchema>

export const AircraftAlertSchema = z.object({
  alertId: z.string().optional(),
  description: z.string(),
  untilExpiration: z.number().int(),
  hardLimit: z.number().int().nullable(),
  softLimit: z.number().int().nullable(),
})

export type AircraftAlert = z.infer<typeof AircraftAlertSchema>

export const AircraftStatusSchema = z.object({
  totalTime: z.number().int().optional(),

  daysUntilNextMaintenance: z.number().int().optional(),
  tachUntilNextMaintenance: z.number().int(),
  usablePercentageHours: z.number().int(),
  totalPercentageHours: z.number().int(),

  warnings: z.array(AircraftAlertSchema),
  cautions: z.array(AircraftAlertSchema),
})

export type AircraftStatus = z.infer<typeof AircraftStatusSchema>

export const AircraftSchema = z.object({
  registration: z.string().max(10).nonempty(),
  displayName: z.string().max(50).nonempty(),
  model: z.string().max(50).nonempty(),
  manufacturer: z.string().max(50).nonempty(),
  yearOfManufacture: z.number().int().positive(),

  status: AircraftStatusSchema.optional(),

  maintenance: AircraftMaintenanceRecordSchema,
  documents: z.array(AircraftDocumentsSchema),

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
export type AircraftInsertRequest = z.infer<typeof AircraftInsertSchema>
export type AircraftUpdateRequest = z.infer<typeof AircraftUpdateSchema>

export const AircraftListResponseSchema = z.object({
  aircrafts: z.array(AircraftSchema),
})

export type AircraftListResponse = z.infer<typeof AircraftListResponseSchema>
