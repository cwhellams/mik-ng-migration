import z from 'zod'
import { AuditableSchema, UpsertSchema } from '../../types/schema.ts'

export enum OccurrenceStatus {
  // original report statuses
  NEW = 'NEW',
  RECEIVED = 'RECEIVED',

  // anonymized version statuses
  ANONYMIZING = 'ANONYMIZING',
  ANONYMIZED = 'ANONYMIZED',
  CLOSED = 'CLOSED',

  DELETED = 'DELETED',
}

export enum OccurrenceCategory {
  // Aerodrome
  ADRM = 'ADRM',
  // Abrupt maneuvre
  AMAN = 'AMAN',
  // Abnormal runway contact
  ARC = 'ARC',
  // ATM/CNS
  ATM = 'ATM',
  // Birdstrike
  BIRD = 'BIRD',
  // Cabin safety events
  CABIN = 'CABIN',
  // Controlled flight into or toward terrain
  CFIT = 'CFIT',
  // Collision with obstacle(s) during take-off and landing
  CTOL = 'CTOL',
  // Evacuation
  EVAC = 'EVAC',
  // Fire/smoke (non-impact)
  'F-NI' = 'F-NI',
  // Fire/smoke (post-impact)
  'F-POST' = 'F-POST',
  // Fuel related
  FUEL = 'FUEL',
  // Ground Collision
  GCOL = 'GCOL',
  // Glider towing related events
  GTOW = 'GTOW',
  // Icing
  ICE = 'ICE',
  // Low altitude operations
  LALT = 'LALT',
  // Loss of control - ground
  'LOC-G' = 'LOC-G',
  // Loss of control - inflight
  'LOC-I' = 'LOC-I',
  // Loss of lifting conditions en-route
  LOLI = 'LOLI',
  // Airprox/ ACAS alert/ loss of separation/ (near) midair collisions
  MAC = 'MAC',
  // Ground Handling
  RAMP = 'RAMP',
  // Runway excursion
  RE = 'RE',
  // Runway incursion - vehicle, aircraft or person
  RI = 'RI',
  // Runway incursion - other
  'RI-O' = 'RI-O',
  // Rwy incursion-vehicle or a/c
  'RI-VA' = 'RI-VA',
  // System/component failure or malfunction [non-powerplant]
  'SCF-NP' = 'SCF-NP',
  // powerplant failure or malfunction
  'SCF-PP' = 'SCF-PP',
  // Security related
  SEC = 'SEC',
  // Turbulence encounter
  TURB = 'TURB',
  // Unintended flight in IMC
  UIMC = 'UIMC',
  // Undershoot/overshoot
  USOS = 'USOS',
  // Collision Wildlife
  WILD = 'WILD',
  // Windshear or thunderstorm
  WSTRW = 'WSTRW',
  // Other
  OTHR = 'OTHR',
  // Unknown or undetermined
  UNK = 'UNK',
}

export const OccurrenceSchema = AuditableSchema.extend({
  id: z.string().readonly(),
  status: z.nativeEnum(OccurrenceStatus),

  occurrenceDate: z.string().datetime(),
  reportDate: z.string().datetime(),
  deadLine: z.string().datetime().optional().readonly(),

  headline: z.string(),
  location: z.string(),

  // description of the event
  description: z.string(),
  categories: z.array(z.nativeEnum(OccurrenceCategory)).min(1),

  // was weather relevant
  isWeatherRelevant: z.boolean().nullable(),

  // IF BIRD OR WILD WAS CHOSEN ABOVE, THE NUMBER OF ANIMALS, SIZE AND SPECIES
  animalNumber: z.string().nullable(),
  animalSize: z.string().nullable(),
  animalSpecies: z.string().nullable(),

  // aircraft, if applicable
  aircraftRegistration: z.string(),
  arrivalAirport: z.string(),
  departureAirport: z.string(),

  isDtoReport: z.boolean(),

  // either anonymized or original report id
  linkedReportId: z.string().nullable(),
})

export type Occurrence = z.infer<typeof OccurrenceSchema>

export const OccurrenceUpsertSchema = UpsertSchema(OccurrenceSchema).omit({
  id: true,
  reportDate: true,
  status: true,
  linkedReportId: true,
})

export type OccurrenceUpsert = z.infer<typeof OccurrenceUpsertSchema>

export const OccurrenceFiltersSchema = z.object({
  status: z.nativeEnum(OccurrenceStatus).optional(),
  aircraftRegistration: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
})

export type OccurrenceFilters = z.infer<typeof OccurrenceFiltersSchema>

export interface OccurrencesListResponse {
  occurrences: Occurrence[]
}
