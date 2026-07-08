import { z } from 'zod'

export const AircraftHilSchema = z.object({
  hilId: z.string().guid(),
  aircraftRegistration: z.string(),
  hilNumber: z.number().int(),
  sourceRef: z.string(),
  defectCat: z.string(),
  description: z.string(),
  openDate: z.string().datetime(),
  name: z.string(),
  dueDate: z.string().datetime(),
  resolvedNoteId: z.string().guid().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

export type AircraftHil = z.infer<typeof AircraftHilSchema>

export const CreateAircraftHilSchema = z.object({
  aircraftRegistration: z.string().min(1),
  hilNumber: z.number().int().positive(),
  sourceRef: z.string().min(1),
  defectCat: z.string().min(1),
  description: z.string().min(1),
  openDate: z.string().datetime(),
  name: z.string().min(1),
  dueDate: z.string().datetime(),
})

export type CreateAircraftHilRequest = z.infer<typeof CreateAircraftHilSchema>

export const UpdateAircraftHilSchema = z
  .object({
    sourceRef: z.string().min(1).optional(),
    defectCat: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    openDate: z.string().datetime().optional(),
    name: z.string().min(1).optional(),
    dueDate: z.string().datetime().optional(),
    resolvedNoteId: z.string().guid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateAircraftHilRequest = z.infer<typeof UpdateAircraftHilSchema>

export const AircraftHilFilterSchema = z.object({
  aircraftRegistration: z.string(),
})

export type AircraftHilFilter = z.infer<typeof AircraftHilFilterSchema>

export const AircraftHilExtensionSchema = z.object({
  extensionId: z.string().guid(),
  hilId: z.string().guid(),
  extensionDate: z.string().datetime(),
  name: z.string(),
  extensionDue: z.string().datetime(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
})

export type AircraftHilExtension = z.infer<typeof AircraftHilExtensionSchema>

export const CreateAircraftHilExtensionSchema = z.object({
  extensionDate: z.string().datetime(),
  name: z.string().min(1),
  extensionDue: z.string().datetime(),
})

export type CreateAircraftHilExtensionRequest = z.infer<typeof CreateAircraftHilExtensionSchema>
