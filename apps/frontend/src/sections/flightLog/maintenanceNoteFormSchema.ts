import { z } from 'zod'

export const MaintenanceNoteFormSchema = z.object({
  description: z.string().min(1),
  performedBy: z.string().min(1),
  flightHours: z.coerce.number().int().min(0),
  flightMinutes: z.coerce.number().int().min(0).max(59),
  rows: z.coerce.number().int().min(0),
})

export type MaintenanceNoteFormValues = z.infer<typeof MaintenanceNoteFormSchema>
