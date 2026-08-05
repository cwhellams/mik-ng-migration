import { z } from 'zod'

export const DefectStatusSchema = z.enum(['ACTIVE', 'MOVED_TO_HIL', 'RESOLVED'])
export type DefectStatus = z.infer<typeof DefectStatusSchema>

export const DefectSchema = z.object({
  defectId: z.string().guid(),
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.number().int(),
  flightId: z.string().nullable(),
  description: z.string(),
  flightMins: z.number().int(),
  // How many rows the defect's own content occupies: 0 renders it inline on its
  // anchor flight's row (the traditional in-flight-defect chip), 1..n gives it
  // its own row(s). Create-only, like flightId/flightMins.
  rows: z.number().int().min(0),
  blankRowsAfter: z.number().int().min(0),
  status: DefectStatusSchema,
  hilId: z.string().guid().nullable(),
  resolvedNoteId: z.string().guid().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

export type Defect = z.infer<typeof DefectSchema>

export const CreateDefectSchema = z
  .object({
    aircraftRegistration: z.string().min(1),
    ajlbSeqNo: z.number().int().positive(),
    flightId: z.string().nullable().optional(),
    description: z.string().min(1),
    flightMins: z.number().int().min(0),
    // When omitted, defaults to 1 (own row) for pre-flight defects (flightId
    // null) and 0 (inline chip) for in-flight defects (flightId set), matching
    // today's rendering; the frontend always sends an explicit rows value.
    rows: z.number().int().min(0).optional(),
    blankRowsAfter: z.number().int().min(0).default(0),
  })
  .transform((data) => ({
    ...data,
    rows: data.rows ?? (data.flightId == null ? 1 : 0),
  }))
  .refine((data) => data.rows > 0 || data.blankRowsAfter === 0, {
    message: 'blankRowsAfter must be 0 when rows is 0',
    path: ['blankRowsAfter'],
  })

export type CreateDefectRequest = z.infer<typeof CreateDefectSchema>

export const UpdateDefectSchema = z
  .object({
    description: z.string().min(1).optional(),
    blankRowsAfter: z.number().int().min(0).optional(),
    hilId: z.string().guid().nullable().optional(),
    resolvedNoteId: z.string().guid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateDefectRequest = z.infer<typeof UpdateDefectSchema>

export const DefectFilterSchema = z.object({
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.coerce.number().int().positive().optional(),
})

export type DefectFilter = z.infer<typeof DefectFilterSchema>
