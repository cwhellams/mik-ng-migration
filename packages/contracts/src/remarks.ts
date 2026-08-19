import { z } from 'zod'

import { FlightLogStatus } from './flight-log.ts'

// A minor, non-airworthiness observation logged against a flight (#1226) -- unlike
// a Defect, a remark has no status, no HIL link and nothing to resolve. It exists
// purely "for your information", always tied to the flight it was written on.
export const RemarkSchema = z.object({
  remarkId: z.string().guid(),
  flightId: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
})

export type Remark = z.infer<typeof RemarkSchema>

export const CreateRemarkSchema = z.object({
  flightId: z.string().min(1),
  // Trimmed, not just checked, so a whitespace-only remark can't slip through as a
  // blank entry -- mirrors CreateDefectSchema's description field.
  description: z.string().trim().min(1),
})

export type CreateRemarkRequest = z.infer<typeof CreateRemarkSchema>

// Either the one flight being edited (NotesStep/FlightLogEntry's "already logged"
// display) or a whole logbook page's aircraft/seqNo scope (LogbookPage's inline
// markers, mirroring DefectFilterSchema) -- a remark has no aircraft/seqNo column of
// its own, so the latter is resolved through a join with flight.logs.
export const RemarkFilterSchema = z
  .object({
    flightId: z.string().min(1).optional(),
    aircraftRegistration: z.string().min(1).optional(),
    ajlbSeqNo: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => !!data.flightId || !!data.aircraftRegistration, {
    message: 'Either flightId or aircraftRegistration is required',
  })

export type RemarkFilter = z.infer<typeof RemarkFilterSchema>

// A remark plus the flight/aircraft context needed to link back to the logbook
// entry, for the flight log admin dashboard's "recent remarks" list.
export const RecentRemarkSchema = RemarkSchema.extend({
  aircraftRegistration: z.string(),
  takeoffTimeUtc: z.string().datetime(),
})

export type RecentRemark = z.infer<typeof RecentRemarkSchema>

export const RecentRemarksResponseSchema = z.object({
  remarks: z.array(RecentRemarkSchema),
})

export type RecentRemarksResponse = z.infer<typeof RecentRemarksResponseSchema>

// GET /v1/remarks/recent's query params. limit is coerced/validated here rather
// than parsed with a raw Number.parseInt at the route, which let a non-numeric
// value reach the DB as NaN and surface as an unhandled 500 instead of a 400.
export const RecentRemarksQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  // Optional so a plain "give me the last N remarks" call keeps working -- the
  // flight log admin dashboard passes FlightLogStatus.NEW to match the scoping
  // of the "flights with incidents/observations" list shown alongside it.
  status: z.nativeEnum(FlightLogStatus).optional(),
})

export type RecentRemarksQuery = z.infer<typeof RecentRemarksQuerySchema>
