import { z } from 'zod'

import { DefectStatusSchema } from './defects.ts'

export const AircraftHilSchema = z.object({
  hilId: z.string().guid(),
  aircraftRegistration: z.string(),
  hilNumber: z.number().int(),
  // Source ref, defect category and due date are not always known when a hold
  // item is opened, so all three are optional (issue #1120).
  sourceRef: z.string().nullable(),
  defectCat: z.string().nullable(),
  description: z.string(),
  restrictions: z.string().nullable(),
  openDate: z.string().datetime(),
  name: z.string(),
  dueDate: z.string().datetime().nullable(),
  resolvedNoteId: z.string().guid().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

export type AircraftHil = z.infer<typeof AircraftHilSchema>

export const CreateAircraftHilSchema = z.object({
  aircraftRegistration: z.string().min(1),
  // Matches the number on the paper hold item list; when omitted the next
  // free number for the aircraft is assigned instead
  hilNumber: z.number().int().positive().optional(),
  sourceRef: z.string().min(1).nullable().optional(),
  defectCat: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  restrictions: z.string().nullable().optional(),
  openDate: z.string().datetime(),
  name: z.string().min(1),
  dueDate: z.string().datetime().nullable().optional(),
  // A hold item can only be opened from an existing, active flight-log defect
  defectId: z.string().guid(),
})

export type CreateAircraftHilRequest = z.infer<typeof CreateAircraftHilSchema>

export const UpdateAircraftHilSchema = z
  .object({
    hilNumber: z.number().int().positive().optional(),
    sourceRef: z.string().min(1).nullable().optional(),
    defectCat: z.string().min(1).nullable().optional(),
    description: z.string().min(1).optional(),
    restrictions: z.string().nullable().optional(),
    openDate: z.string().datetime().optional(),
    name: z.string().min(1).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    resolvedNoteId: z.string().guid().nullable().optional(),
    // The flight-log defects this hold item defers. Sent as the complete
    // desired set so a wrongly picked defect can be swapped for the right one.
    // A hold item must always defer at least one defect.
    defectIds: z.array(z.string().guid()).min(1).optional(),
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

// A flight-log defect deferred to a HIL entry. Carries just enough to link back
// to the page of the journey log book where the defect was recorded.
export const HilLinkedDefectSchema = z.object({
  defectId: z.string().guid(),
  ajlbSeqNo: z.number().int(),
  flightId: z.string().nullable(),
  description: z.string(),
  status: DefectStatusSchema,
  // Position within the logbook, used to find which page the defect is on
  flightMins: z.number().int(),
})

export type HilLinkedDefect = z.infer<typeof HilLinkedDefectSchema>

export const AircraftHilDetailSchema = AircraftHilSchema.extend({
  extensions: z.array(AircraftHilExtensionSchema),
  // The latest extension due date if the item has been extended, otherwise
  // dueDate — null when the hold item has no due date at all
  effectiveDueDate: z.string().datetime().nullable(),
  isOverdue: z.boolean(),
  defects: z.array(HilLinkedDefectSchema),
})

export type AircraftHilDetail = z.infer<typeof AircraftHilDetailSchema>

export const AircraftHilOverviewSchema = z.object({
  aircraftRegistration: z.string(),
  // An aircraft is grounded while a defect has no HIL deferral and no
  // maintenance release, or while a HIL item is past its effective due date.
  isGrounded: z.boolean(),
  openDefectCount: z.number().int(),
  // The defects behind openDefectCount, so the grounding banner can link
  // straight to each one on the logbook, not just show a count.
  openDefects: z.array(HilLinkedDefectSchema),
  overdueHilCount: z.number().int(),
  hil: z.array(AircraftHilDetailSchema),
})

export type AircraftHilOverview = z.infer<typeof AircraftHilOverviewSchema>

export const AircraftHilOverviewFilterSchema = z.object({
  aircraftRegistration: z.string().optional(),
  includeResolved: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export type AircraftHilOverviewFilter = z.infer<typeof AircraftHilOverviewFilterSchema>

export const AircraftHilAuditEntrySchema = z.object({
  auditId: z.number().int(),
  hilId: z.string().guid(),
  operationType: z.string(),
  changedData: z.unknown().nullable(),
  newData: z.unknown().nullable(),
  changedBy: z.string(),
  changedAt: z.string().datetime(),
})

export type AircraftHilAuditEntry = z.infer<typeof AircraftHilAuditEntrySchema>
