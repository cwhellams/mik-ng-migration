import { z } from 'zod'

import { AuditableSchema, BooleanSchema } from './schema.ts'
import { AircraftDocumentSchema } from './aircraft-documents.ts'

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

/**
 * The fuel types the club's fleet actually takes, spelled exactly as
 * `flight.fuel_types` spells them.
 *
 * This is the single vocabulary, and it lives here because the fleet owns it:
 * `flight.fuel_types` is the reference table, `flight.aircraft.fuel_types` is
 * what each aircraft is allowed, and everything else — expense claims, local
 * price caps, liquid records — refers to it.
 *
 * Before #1119 there were three. The reference table said `JET A-1` and
 * `MOGAS 98E5`; `expenses.ts` independently declared
 * `['100LL', 'JetA1', 'mogas']`; and the issue itself introduced `BE98`. The
 * club's answer was to consolidate on the reference table, so `BE98` is
 * `MOGAS 98E5`, `JetA1` is `JET A-1`, and `V2060` renamed the stored values to
 * match — with foreign keys, so they cannot drift apart again.
 *
 * The full reference table has four more entries (`JET A`, `JP-8`,
 * `EN228 SUPER`, `EN228 SUPER PLUS`) that no club aircraft takes. Fetch
 * `GET /v1/aircrafts/fuel-types` where the whole list is wanted; this constant
 * is for the dropdowns that should only ever offer the four in use.
 */
export const FUEL_TYPES = ['JET A-1', '100LL', 'MOGAS 98E5', 'MOGAS 95E10'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const FuelTypeSchema = z.object({
  name: z.string(),
  sortOrder: z.number().int(),
})

export type FuelTypeEntry = z.infer<typeof FuelTypeSchema>

export const FuelTypesListResponseSchema = z.object({
  fuelTypes: z.array(FuelTypeSchema),
})

export type FuelTypesListResponse = z.infer<typeof FuelTypesListResponseSchema>

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
  fuelTypes: z.array(z.string().nonempty()),
  preferredFuelType: z.string().nullable().optional(),
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
