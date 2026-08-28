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
  // The day the defect was observed, as it reads in the physical journey log book.
  // Editable, unlike createdAt: a defect found on the ramp is routinely entered
  // days later (#1254), and it is this date the logbook shows.
  recordedOn: z.string().date(),
  // How many rows the defect's own content occupies: 0 renders it inline on its
  // anchor flight's row (the traditional in-flight-defect chip), 1..n gives it
  // its own row(s). Create-only, like flightId/flightMins.
  rows: z.number().int().min(0),
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
    // A whitespace-only description would still create an ACTIVE defect that grounds the
    // aircraft, so it's trimmed (not just checked) -- both to reject it and to keep a
    // description that's merely padded with whitespace from being stored verbatim.
    description: z.string().trim().min(1),
    flightMins: z.number().int().min(0),
    // Omitted means "today" in the club's timezone, resolved by the backend rather
    // than defaulted here: contracts stay clock-free, and CURRENT_DATE on a pool
    // pinned to UTC would hand back yesterday for anything entered late evening.
    recordedOn: z.string().date().optional(),
    // When omitted, defaults to 1 (own row) for pre-flight defects (flightId
    // null) and 0 (inline chip) for in-flight defects (flightId set), matching
    // today's rendering; the frontend always sends an explicit rows value.
    rows: z.number().int().min(0).optional(),
  })
  .transform((data) => ({
    ...data,
    rows: data.rows ?? (data.flightId == null ? 1 : 0),
  }))

export type CreateDefectRequest = z.infer<typeof CreateDefectSchema>

export const UpdateDefectSchema = z
  .object({
    description: z.string().trim().min(1).optional(),
    recordedOn: z.string().date().optional(),
    // Only for a pre-flight defect (flightId null) -- an in-flight defect is always an
    // inline chip (rows: 0) and can't be converted into a standalone row, see api.ts.
    rows: z.number().int().min(0).optional(),
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
