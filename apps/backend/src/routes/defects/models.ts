import { z } from 'zod'

export const DefectStatusSchema = z.enum(['ACTIVE', 'MOVED_TO_HIL', 'RESOLVED'])
export type DefectStatus = z.infer<typeof DefectStatusSchema>

export const DefectSchema = z.object({
  defectId: z.string().uuid(),
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.number().int(),
  flightId: z.string().nullable(),
  description: z.string(),
  flightMins: z.number().int(),
  blankRowsAfter: z.number().int().min(0),
  status: DefectStatusSchema,
  hilId: z.string().uuid().nullable(),
  resolvedNoteId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

export type Defect = z.infer<typeof DefectSchema>

export const CreateDefectSchema = z.object({
  aircraftRegistration: z.string().min(1),
  ajlbSeqNo: z.number().int().positive(),
  flightId: z.string().nullable().optional(),
  description: z.string().min(1),
  flightMins: z.number().int().min(0),
  blankRowsAfter: z.number().int().min(0).default(0),
})

export type CreateDefectRequest = z.infer<typeof CreateDefectSchema>

export const UpdateDefectSchema = z
  .object({
    description: z.string().min(1).optional(),
    blankRowsAfter: z.number().int().min(0).optional(),
    hilId: z.string().uuid().nullable().optional(),
    resolvedNoteId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateDefectRequest = z.infer<typeof UpdateDefectSchema>

export const DefectFilterSchema = z.object({
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.coerce.number().int().positive(),
})

export type DefectFilter = z.infer<typeof DefectFilterSchema>
