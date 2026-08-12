import z from 'zod'
import { AuditableSchema } from './schema.ts'

export enum OccurrenceStatus {
  // only the independent SMS processor can see the reports with
  // personal data
  NEW = 'NEW',
  RECEIVED = 'RECEIVED',
  ANONYMIZING = 'ANONYMIZING',

  // safety manager can process these anonymized reports
  ANONYMIZED = 'ANONYMIZED',
  PROCESSED = 'PROCESSED',
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

export const OccurrenceCommentSchema = z.object({
  at: z.string().datetime(),
  by: z.string(),
  status: z.nativeEnum(OccurrenceStatus).nullable(),
  comment: z.string().nullish(),
})

export type OccurrenceComment = z.infer<typeof OccurrenceCommentSchema>

export const OccurrenceProcessedPayloadSchema = z.object({
  adversity: z.number().min(1).max(5),
  probability: z.number().min(1).max(5),
  forwardedToTraficom: z.boolean(),
})
export type OccurrenceProcessedPayload = z.infer<typeof OccurrenceProcessedPayloadSchema>

export const OccurrenceClosedPayloadSchema = z.object({
  adversity: z.number().min(1).max(5),
  probability: z.number().min(1).max(5),
  mitigatingAction: z.string().nullable(),
})
export type OccurrenceClosedPayload = z.infer<typeof OccurrenceClosedPayloadSchema>

export const OccurrenceHandlingSchema = z.object({
  processed: OccurrenceProcessedPayloadSchema.extend({
    at: z.string().datetime().readonly().optional(),
    by: z.string().readonly().optional(),
  }).optional(),
  closed: OccurrenceClosedPayloadSchema.extend({
    at: z.string().datetime().readonly().optional(),
    by: z.string().readonly().optional(),
  }).optional(),
})

export type OccurrenceHandling = z.infer<typeof OccurrenceHandlingSchema>

export const OccurrenceAccessSchema = z.object({
  accessId: z.number().readonly().optional(),
  memberId: z.string().nullish(),
  lastName: z.string().nullish(),
  roleId: z.string().nullish(),
  author: z.boolean().default(false),
  write: z.boolean().default(false),
  manage: z.boolean().default(false),
  at: z.string().datetime().optional().readonly(),
  by: z.string().optional().readonly(),
})

export type OccurrenceAccess = z.infer<typeof OccurrenceAccessSchema>

export const OccurrenceAttachmentSchema = z.object({
  attachmentId: z.number().readonly(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  // report status at the time the attachment was uploaded - lets the UI show
  // whether it came from the original report or was added later
  originStatus: z.nativeEnum(OccurrenceStatus).readonly(),
  at: z.string().datetime().readonly(),
  by: z.string().readonly(),
})

export type OccurrenceAttachment = z.infer<typeof OccurrenceAttachmentSchema>

export const OccurrenceSchema = AuditableSchema.extend({
  id: z.string().readonly(),
  status: z.nativeEnum(OccurrenceStatus),

  occurrenceDate: z.string().datetime(),
  reportDate: z.string().datetime(),
  deadLine: z.string().datetime().optional().readonly(),
  processedDate: z.string().datetime().optional().readonly(),

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
  aircraftRegistration: z.string().nullable(),
  aircraftTechnicalFault: z.boolean().nullable(),
  arrivalAirport: z.string().nullable(),
  departureAirport: z.string().nullable(),

  isDtoReport: z.boolean(),

  // either anonymized or original report id
  linkedReportId: z.string().nullable(),

  access: z.array(OccurrenceAccessSchema),
  comments: z.array(OccurrenceCommentSchema).readonly(),
  handling: OccurrenceHandlingSchema.readonly(),
  attachments: z.array(OccurrenceAttachmentSchema).readonly(),
})

export type Occurrence = z.infer<typeof OccurrenceSchema>

// A plain .omit() on the original schema, not UpsertSchema(OccurrenceSchema)
// chained with a further .omit() — see the caveat documented on UpsertSchema
// itself (@mik/contracts/schema): a second .omit() beyond the audit fields would
// produce a type that still (falsely) requires them.
export const OccurrenceUpsertSchema = OccurrenceSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  id: true,
  reportDate: true,
  deadLine: true,
  status: true,
  linkedReportId: true,
  access: true,
  comments: true,
  handling: true,
  attachments: true,
})

export type OccurrenceUpsert = z.infer<typeof OccurrenceUpsertSchema>

export const OccurrenceFiltersSchema = z.object({
  status: z.nativeEnum(OccurrenceStatus).optional(),
  ignoreStatuses: z.array(z.nativeEnum(OccurrenceStatus)).optional(),
  aircraftRegistration: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
})

export type OccurrenceFilters = z.infer<typeof OccurrenceFiltersSchema>

export interface OccurrencesListResponse {
  occurrences: Occurrence[]
}
