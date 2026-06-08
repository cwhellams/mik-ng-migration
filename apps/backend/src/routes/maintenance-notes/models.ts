import { z } from 'zod'

export const MaintenanceNoteSchema = z.object({
  noteId: z.string().uuid(),
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.number().int(),
  description: z.string(),
  performedBy: z.string(),
  flightMins: z.number().int(),
  blankRowsAfter: z.number().int().min(0),
  hilId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
})

export type MaintenanceNote = z.infer<typeof MaintenanceNoteSchema>

export const CreateMaintenanceNoteSchema = z.object({
  aircraftRegistration: z.string().min(1),
  ajlbSeqNo: z.number().int().positive(),
  description: z.string().min(1),
  performedBy: z.string().min(1),
  flightMins: z.number().int().min(0),
  blankRowsAfter: z.number().int().min(0).default(0),
  hilId: z.string().uuid().nullable().optional(),
})

export type CreateMaintenanceNoteRequest = z.infer<typeof CreateMaintenanceNoteSchema>

export const UpdateMaintenanceNoteSchema = z
  .object({
    description: z.string().min(1).optional(),
    performedBy: z.string().min(1).optional(),
    flightMins: z.number().int().min(0).optional(),
    blankRowsAfter: z.number().int().min(0).optional(),
    hilId: z.string().uuid().nullable().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateMaintenanceNoteRequest = z.infer<typeof UpdateMaintenanceNoteSchema>

export const MaintenanceNoteFilterSchema = z.object({
  aircraftRegistration: z.string(),
  ajlbSeqNo: z.coerce.number().int().positive(),
})

export type MaintenanceNoteFilter = z.infer<typeof MaintenanceNoteFilterSchema>
