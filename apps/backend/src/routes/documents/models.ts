import { z } from 'zod'

import { AuditableSchema, BooleanSchema, OptionalLimitOffsetSchema } from '../../types/schema.ts'
import { problem } from '../response.ts'

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

export const DocumentFiltersSchema = z
  .object({
    category: z
      .string()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    search: z
      .string()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    tags: z
      .string()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    showArchived: BooleanSchema.optional().default(false),
  })
  .merge(OptionalLimitOffsetSchema())

export type DocumentFilters = z.infer<typeof DocumentFiltersSchema>

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSchema),
  total: z.number().int().min(0),
})

export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>

export const DownloadDocumentSchema = z.object({
  tinyUrl: z.string().url().nullable(),
  qrCode: z.instanceof(Buffer),
})

export type DownloadDocument = z.infer<typeof DownloadDocumentSchema>

export const TinyUrlSchema = z.object({
  shortCode: z.string().length(8),
  documentId: z.number().int().positive().nullable(),
  aircraftDocumentId: z.number().int().positive().nullable(),
  documentType: z.enum(['member', 'aircraft']),
  createdAt: z.string(),
  expiresAt: z.string(),
  accessCount: z.number().int().min(0),
  lastAccessedAt: z.string().nullable(),
  createdBy: z.string(),
})

export type TinyUrl = z.infer<typeof TinyUrlSchema>

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
  NEWSLETTER = 'newsletter',
  AIRFIELDS = 'airfields',
  OTHER = 'other',
}

const DocumentIdSchema = z.string().transform((val, ctx) => {
  const parsed = Number.parseInt(val, 10)
  if (Number.isNaN(parsed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid document ID',
    })
    return z.NEVER
  }
  return parsed
})

export function validateDocumentId(
  idString: string | undefined,
): number | ReturnType<typeof problem> {
  if (!idString) {
    return problem({ status: 400, detail: 'Document ID is required' })
  }

  const result = DocumentIdSchema.safeParse(idString)

  if (!result.success) {
    return problem({ status: 400, detail: 'Invalid document ID' })
  }

  return result.data
}
