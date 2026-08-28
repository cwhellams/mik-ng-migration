import { z } from 'zod'

export const MaintenanceNoteSchema = z.object({
  noteId: z.string().guid(),
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.number().int(),
  description: z.string(),
  performedBy: z.string(),
  flightMins: z.number().int(),
  // The day the work was performed, as it reads in the physical journey log book.
  // Editable, unlike createdAt: notes are routinely entered days after the fact
  // (#1254), and it is this date the logbook shows.
  recordedOn: z.string().date(),
  // How many rows the note's own content occupies: 0 renders it inline on its
  // anchor flight's row, 1..n gives it its own row(s).
  rows: z.number().int().min(0),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
})

export type MaintenanceNote = z.infer<typeof MaintenanceNoteSchema>

export const CreateMaintenanceNoteSchema = z.object({
  aircraftRegistration: z.string().min(1),
  ajlbSeqNo: z.number().int().positive(),
  description: z.string().trim().min(1),
  performedBy: z.string().trim().min(1),
  flightMins: z.number().int().min(0),
  // Omitted means "today" in the club's timezone, resolved by the backend rather
  // than defaulted here: contracts stay clock-free, and CURRENT_DATE on a pool
  // pinned to UTC would hand back yesterday for anything entered late evening.
  recordedOn: z.string().date().optional(),
  rows: z.number().int().min(0).default(1),
  // Currently-open hold items on this aircraft that this note closes
  hilIds: z.array(z.string().guid()).optional(),
  // Active logbook defects on this aircraft that this note resolves directly,
  // without ever having been deferred to a hold item
  defectIds: z.array(z.string().guid()).optional(),
})

export type CreateMaintenanceNoteRequest = z.infer<typeof CreateMaintenanceNoteSchema>

export const UpdateMaintenanceNoteSchema = z
  .object({
    description: z.string().trim().min(1).optional(),
    performedBy: z.string().trim().min(1).optional(),
    flightMins: z.number().int().min(0).optional(),
    recordedOn: z.string().date().optional(),
    rows: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateMaintenanceNoteRequest = z.infer<typeof UpdateMaintenanceNoteSchema>

export const MaintenanceNoteFilterSchema = z.object({
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.coerce.number().int().positive().optional(),
})

export type MaintenanceNoteFilter = z.infer<typeof MaintenanceNoteFilterSchema>
