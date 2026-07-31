import { z } from 'zod'

export enum AmeStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const AME_MEDICAL_TYPES = ['EASA_CLASS_1', 'EASA_CLASS_2', 'LAPL', 'FAA'] as const
export type AmeMedicalType = (typeof AME_MEDICAL_TYPES)[number]

export const CreateAmeEntrySchema = z.object({
  name: z.string().min(1).max(200),
  medicalCentre: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  price: z.number().positive().nullable().optional(),
  medicalTypes: z.array(z.enum(AME_MEDICAL_TYPES)).min(1),
  notes: z.string().max(2000).nullable().optional(),
  reportDate: z.string().date(),
})
export type CreateAmeEntry = z.infer<typeof CreateAmeEntrySchema>

export const RejectAmeEntrySchema = z.object({
  reason: z.string().min(1).max(1000),
})

export const AmeEntrySchema = z.object({
  id: z.string().uuid(),
  submittedBy: z.string(),
  submittedByName: z.string().nullable().optional(),
  name: z.string(),
  medicalCentre: z.string(),
  location: z.string(),
  price: z.number().nullable().optional(),
  medicalTypes: z.array(z.string()),
  notes: z.string().nullable().optional(),
  reportDate: z.string(),
  status: z.nativeEnum(AmeStatus),
  approvedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  rejectedBy: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AmeEntry = z.infer<typeof AmeEntrySchema>

export const AmeListFiltersSchema = z.object({
  medicalType: z.enum(AME_MEDICAL_TYPES).optional(),
  sort: z.enum(['price_asc', 'report_date_desc']).optional().default('report_date_desc'),
  status: z.nativeEnum(AmeStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type AmeListFilters = z.infer<typeof AmeListFiltersSchema>

export const AmeListResponseSchema = z.object({
  entries: z.array(AmeEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AmeListResponse = z.infer<typeof AmeListResponseSchema>
