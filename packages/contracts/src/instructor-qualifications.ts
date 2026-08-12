import { z } from 'zod'
import { AuditableSchema } from './schema.ts'

export const InstructorQualificationSchema = AuditableSchema.extend({
  id: z.number(),
  memberId: z.string(),
  fiExpiry: z.string().date().nullish(),
  iriExpiry: z.string().date().nullish(),
  criExpiry: z.string().date().nullish(),
  sepExpiry: z.string().date().nullish(),
  medicalClass1Expiry: z.string().date().nullish(),
  medicalClass2Expiry: z.string().date().nullish(),
  medicalLaplExpiry: z.string().date().nullish(),
})

export type InstructorQualification = z.infer<typeof InstructorQualificationSchema>

export const InstructorQualificationUpsertSchema = z.object({
  fiExpiry: z.string().date().nullish(),
  iriExpiry: z.string().date().nullish(),
  criExpiry: z.string().date().nullish(),
  sepExpiry: z.string().date().nullish(),
  medicalClass1Expiry: z.string().date().nullish(),
  medicalClass2Expiry: z.string().date().nullish(),
  medicalLaplExpiry: z.string().date().nullish(),
})

export type InstructorQualificationUpsert = z.infer<typeof InstructorQualificationUpsertSchema>

export const InstructorQualificationHistorySchema = z.object({
  historyId: z.number(),
  qualificationId: z.number(),
  memberId: z.string(),
  fiExpiry: z.string().date().nullish(),
  iriExpiry: z.string().date().nullish(),
  criExpiry: z.string().date().nullish(),
  sepExpiry: z.string().date().nullish(),
  medicalClass1Expiry: z.string().date().nullish(),
  medicalClass2Expiry: z.string().date().nullish(),
  medicalLaplExpiry: z.string().date().nullish(),
  changedAt: z.string().datetime(),
  changedBy: z.string(),
  operationType: z.string(),
})

export type InstructorQualificationHistory = z.infer<typeof InstructorQualificationHistorySchema>

// Summary for the instructor list view
export const InstructorStatusSummarySchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fiExpiry: z.string().date().nullish(),
  iriExpiry: z.string().date().nullish(),
  criExpiry: z.string().date().nullish(),
  sepExpiry: z.string().date().nullish(),
  medicalClass1Expiry: z.string().date().nullish(),
  medicalClass2Expiry: z.string().date().nullish(),
  medicalLaplExpiry: z.string().date().nullish(),
  // ID of the most recent LICENSE proof file (FI/IRI/CRI/SEP), null if none
  licenseProofId: z.number().int().nullable().optional(),
  // ID of the most recent MEDICAL proof file (MED I/II/LAPL), null if none
  medicalProofId: z.number().int().nullable().optional(),
})

export type InstructorStatusSummary = z.infer<typeof InstructorStatusSummarySchema>

export const InstructorStatusListResponseSchema = z.object({
  instructors: z.array(InstructorStatusSummarySchema),
})

export type InstructorStatusListResponse = z.infer<typeof InstructorStatusListResponseSchema>

export type ProofDocumentCategory = 'LICENSE' | 'MEDICAL'

export interface ProofFile {
  id: number
  memberId: string
  fileName: string
  storageKey: string
  mimeType: string
  uploadedAt: string
  uploadedBy: string
  historyId: number | null
  documentCategory: ProofDocumentCategory
}

// Point-in-time snapshot of an instructor's qualifications.
// licenseProofFile and medicalProofFile are the most recent proof documents
// of each category uploaded on or before the snapshot date.
export interface QualificationSnapshot {
  asOf: string
  memberId: string
  fiExpiry: string | null | undefined
  iriExpiry: string | null | undefined
  criExpiry: string | null | undefined
  sepExpiry: string | null | undefined
  medicalClass1Expiry: string | null | undefined
  medicalClass2Expiry: string | null | undefined
  medicalLaplExpiry: string | null | undefined
  changedAt: string | null
  changedBy: string | null
  licenseProofFile: ProofFile | null
  medicalProofFile: ProofFile | null
}
