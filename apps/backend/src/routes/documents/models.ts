import { z } from 'zod'

import { AuditableSchema, BooleanSchema } from '../../types/schema.ts'

export const DocumentSchema = AuditableSchema.extend({
  documentId: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  category: z.string().min(1).max(50),
  documentUrl: z.string().url().nullable(),
  publishedDate: z.string().date(),
  isPublic: z.boolean(),
  isArchived: z.boolean().optional(),
  tags: z.array(z.string()).nullable().optional(),
  // File metadata for uploaded files
  fileName: z.string().nullable(),
  fileSize: z.number().int().positive().nullable(),
  mimeType: z.string().nullable(),
  storageKey: z.string().nullable(), // Key for Digital Ocean Spaces
})

export type Document = z.infer<typeof DocumentSchema>

export const DocumentFiltersSchema = z.object({
  category: z
    .string()
    .optional()
    .transform(val => (val === '' ? undefined : val)),
  search: z
    .string()
    .optional()
    .transform(val => (val === '' ? undefined : val)),
  tags: z
    .string()
    .optional()
    .transform(val => (val === '' ? undefined : val)),
  showArchived: BooleanSchema.optional().default('false'),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type DocumentFilters = z.infer<typeof DocumentFiltersSchema>

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSchema),
  total: z.number().int().min(0),
})

export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>

export const DownloadDocument = z.object({
  documentId: z.number().int().positive().optional(),
  presignedUrl: z.string().url().nullable(),
})

export type DownloadDocument = z.infer<typeof DownloadDocument>

export const DocumentUpdateSchema = DocumentSchema.pick({
  title: true,
  description: true,
  category: true,
  isArchived: true,
  tags: true,
})

export type DocumentUpdate = z.infer<typeof DocumentUpdateSchema>

// Categories for documents
export enum DocumentCategory {
  FINANCIAL = 'financial',
  AUDIT = 'audit',
  MINUTES = 'minutes',
  POLICY = 'policy',
  SAFETY = 'safety',
  NEWS = 'news',
  AIRFIELDS = 'airfields',
  OTHER = 'other',
}
