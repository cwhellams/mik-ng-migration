import { z } from 'zod'
import { nullableTrimmedString, PaginationSchema } from './schema.ts'

export enum AmeStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
}

export enum AmeReviewStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const AME_MEDICAL_TYPES = ['EASA_CLASS_1', 'EASA_CLASS_2', 'LAPL', 'FAA'] as const
export type AmeMedicalType = (typeof AME_MEDICAL_TYPES)[number]

export const CreateAmeEntrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  medicalCentre: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  price: z.number().positive().nullable().optional(),
  medicalTypes: z.array(z.enum(AME_MEDICAL_TYPES)).min(1),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  reportDate: z.string().date(),
})
export type CreateAmeEntry = z.infer<typeof CreateAmeEntrySchema>

export const RejectAmeEntrySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
})

export const RateAmeEntrySchema = z.object({
  stars: z.number().int().min(1).max(5),
})
export type RateAmeEntry = z.infer<typeof RateAmeEntrySchema>

export const SuggestAmeEditSchema = z.object({
  name: z.string().trim().min(1).max(200),
  medicalCentre: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  price: z.number().positive().nullable().optional(),
  medicalTypes: z.array(z.enum(AME_MEDICAL_TYPES)).min(1),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  reportDate: z.string().date(),
})
export type SuggestAmeEdit = z.infer<typeof SuggestAmeEditSchema>

export const RequestAmeRemovalSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
})
export type RequestAmeRemoval = z.infer<typeof RequestAmeRemovalSchema>

export const AmeEntrySchema = z.object({
  id: z.string().uuid(),
  submittedBy: z.string(),
  submittedByName: z.string().nullable().optional(),
  name: z.string(),
  medicalCentre: z.string(),
  location: z.string(),
  price: z.number().nullable().optional(),
  medicalTypes: z.array(z.string()),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  reportDate: z.string(),
  status: z.nativeEnum(AmeStatus),
  approvedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  rejectedBy: z.string().nullable().optional(),
  rejectionReason: nullableTrimmedString(z.string().max(1000)).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  averageRating: z.number().nullable().optional(),
  ratingCount: z.number(),
  myRating: z.number().nullable().optional(),
})
export type AmeEntry = z.infer<typeof AmeEntrySchema>

export const AmeEditSuggestionSchema = z.object({
  id: z.string().uuid(),
  ameId: z.string().uuid(),
  submittedBy: z.string(),
  submittedByName: z.string().nullable().optional(),
  name: z.string(),
  medicalCentre: z.string(),
  location: z.string(),
  price: z.number().nullable().optional(),
  medicalTypes: z.array(z.string()),
  notes: nullableTrimmedString(z.string().max(2000)).optional(),
  reportDate: z.string(),
  status: z.nativeEnum(AmeReviewStatus),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  rejectionReason: nullableTrimmedString(z.string().max(1000)).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // current ame_list values for the same fields, so admins can diff proposed vs live
  currentName: z.string().optional(),
  currentMedicalCentre: z.string().optional(),
  currentLocation: z.string().optional(),
  currentPrice: z.number().nullable().optional(),
  currentMedicalTypes: z.array(z.string()).optional(),
  currentNotes: nullableTrimmedString(z.string().max(2000)).optional(),
  currentReportDate: z.string().optional(),
})
export type AmeEditSuggestion = z.infer<typeof AmeEditSuggestionSchema>

export const AmeRemovalRequestSchema = z.object({
  id: z.string().uuid(),
  ameId: z.string().uuid(),
  ameName: z.string().optional(),
  submittedBy: z.string(),
  submittedByName: z.string().nullable().optional(),
  reason: z.string().trim().min(1).max(1000),
  status: z.nativeEnum(AmeReviewStatus),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  rejectionReason: nullableTrimmedString(z.string().max(1000)).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AmeRemovalRequest = z.infer<typeof AmeRemovalRequestSchema>

export const AmeListFiltersSchema = z
  .object({
    medicalType: z.enum(AME_MEDICAL_TYPES).optional(),
    sort: z.enum(['price_asc', 'report_date_desc']).optional().default('report_date_desc'),
    status: z.nativeEnum(AmeStatus).optional(),
  })
  .merge(PaginationSchema(50))
export type AmeListFilters = z.infer<typeof AmeListFiltersSchema>

export const AmeListResponseSchema = z.object({
  entries: z.array(AmeEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AmeListResponse = z.infer<typeof AmeListResponseSchema>

export const AmeReviewFiltersSchema = z
  .object({
    status: z.nativeEnum(AmeReviewStatus).optional(),
  })
  .merge(PaginationSchema(50))
export type AmeReviewFilters = z.infer<typeof AmeReviewFiltersSchema>

export const AmeEditSuggestionListResponseSchema = z.object({
  entries: z.array(AmeEditSuggestionSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AmeEditSuggestionListResponse = z.infer<typeof AmeEditSuggestionListResponseSchema>

export const AmeRemovalRequestListResponseSchema = z.object({
  entries: z.array(AmeRemovalRequestSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AmeRemovalRequestListResponse = z.infer<typeof AmeRemovalRequestListResponseSchema>

export const AmePendingCountsSchema = z.object({
  submissions: z.number(),
  editSuggestions: z.number(),
  removalRequests: z.number(),
})
export type AmePendingCounts = z.infer<typeof AmePendingCountsSchema>
