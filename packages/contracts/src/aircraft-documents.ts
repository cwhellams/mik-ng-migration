import { z } from 'zod'
import {
  AuditableSchema,
  LimitOffsetSchema,
  nullableTrimmedString,
  optionalTrimmedString,
} from './schema.ts'

// Aircraft document type enum
export const AircraftDocumentType = z.enum([
  'ARC',
  'Noise Certificate',
  'Insurance Certificate',
  'Registration',
  'Radio Licence',
  'Transponder Mode S certificate',
  'Certificate of Airworthiness',
  'Weight Report',
  'Finavia Season card',
  'Checklist',
  'POH / AFM',
  'Maintenance Manual',
  'Other',
])

export type AircraftDocumentType = z.infer<typeof AircraftDocumentType>

// Aircraft document schema
export const AircraftDocumentSchema = z.object({
  documentId: z.number().optional(),
  aircraftRegistration: z.string().min(1),
  documentType: AircraftDocumentType,
  title: z.string().trim().min(1).max(200),
  description: nullableTrimmedString(z.string().max(1000)).optional(),
  documentUrl: z.string().url().optional(),
  validFrom: z.string().nullable().optional(), // ISO date string
  validTo: z.string().nullable().optional(), // ISO date string
  isActive: z.boolean().default(true),
  // File metadata
  fileName: z.string(),
  fileSize: z.number().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
})

export type AircraftDocument = z.infer<typeof AircraftDocumentSchema>

export const AircraftDocumentAuditableSchema = AuditableSchema.extend(AircraftDocumentSchema.shape)

export type AircraftDocumentAuditable = z.infer<typeof AircraftDocumentAuditableSchema>

// Filters for aircraft documents
export const AircraftDocumentFiltersSchema = z
  .object({
    documentId: z.coerce.number().optional(),
    aircraftRegistration: z.string().optional(),
    documentType: AircraftDocumentType.optional(),
    validOnly: z.coerce.boolean().optional(), // Show only valid documents (within date range)
    validFrom: z.date().nullable().optional(),
    validTo: z.date().nullable().optional(),
  })
  .merge(LimitOffsetSchema(100))

export type AircraftDocumentFilters = z.infer<typeof AircraftDocumentFiltersSchema>

// Response types
export interface AircraftDocumentListResponse {
  documents: AircraftDocumentAuditable[]
  total: number
}

// Upload form data for aircraft documents
export const AircraftDocumentUploadSchema = z.object({
  aircraftRegistration: z.string().min(1),
  documentType: AircraftDocumentType,
  title: z.string().trim().min(1).max(200),
  description: optionalTrimmedString(z.string().max(1000)),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  isActive: z.coerce.boolean().default(true),
  fileName: z.string().min(1),
})

export type AircraftDocumentUpload = z.infer<typeof AircraftDocumentUploadSchema>
