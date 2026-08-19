import { z } from 'zod'
import { optionalTrimmedString } from './schema.ts'

export const MileageAllowanceSchema = z.object({
  id: z.number().int(),
  taxYear: z.number().int(),
  ratePerKm: z.number().positive(),
  discountPct: z.number().min(0).max(100),
  effectiveRatePerKm: z.number().positive(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type MileageAllowance = z.infer<typeof MileageAllowanceSchema>

export const UpsertMileageAllowanceSchema = z.object({
  taxYear: z.number().int().min(2020).max(2100),
  ratePerKm: z.number().positive(),
  discountPct: z.number().min(0).max(100).default(50),
})
export type UpsertMileageAllowance = z.infer<typeof UpsertMileageAllowanceSchema>

// ─── Mileage legs (one row per one-way journey within a claim) ───────────────
// A claim can have multiple legs — e.g. a round trip is two legs, not one
// free-text round-trip string (issue #1021).

export const AddressPointSchema = z.object({
  label: z.string().min(1).max(500),
  // Optional for the same reason as the leg's own start/end coordinates — a manually
  // typed waypoint (address lookup unavailable) has no lat/lon and is simply excluded
  // from the server-side route distance computation.
  lat: z.number().optional(),
  lon: z.number().optional(),
})
export type AddressPoint = z.infer<typeof AddressPointSchema>

const MileageLegBaseSchema = z.object({
  id: z.number().int().optional(),
  claimId: z.string().guid().optional(),
  /** Legacy free-text route, only populated on legs created before issue #1021 */
  route: z.string().optional(),
  // Address text is always required; lat/lon are optional — if address lookup (Nominatim)
  // is down or throttled, the member can still type the address by hand and submit the
  // claim, they just lose the auto-computed distance and the >20% justification check
  // for that leg (see hasRequiredJustification below and the server-side recompute in
  // routes/expenses/api.ts, both of which treat a missing coordinate as "can't verify").
  startAddress: z.string().min(1).max(500),
  startLat: z.number().optional(),
  startLon: z.number().optional(),
  endAddress: z.string().min(1).max(500),
  endLat: z.number().optional(),
  endLon: z.number().optional(),
  /** Ordered intermediate stops, for journeys that aren't the most direct route */
  waypoints: z.array(AddressPointSchema).default([]),
  journeyDate: z.string().date(),
  distanceKm: z.number().positive(),
  /** Server-computed start->end distance with no waypoints, for comparison against distanceKm */
  directDistanceKm: z.number().positive().optional(),
  justificationNote: optionalTrimmedString(z.string().max(1000)),
  boardApproved: z.boolean().default(false),
  ratePerKm: z.number().positive().optional(),
})

export const MileageLegSchema = MileageLegBaseSchema
export type MileageLeg = z.infer<typeof MileageLegSchema>

function hasRequiredJustification(leg: {
  distanceKm: number
  directDistanceKm?: number
  justificationNote?: string
}): boolean {
  // Nullish check, not falsy — directDistanceKm can legitimately be 0 (e.g. two very
  // close addresses geocoding to the same point), and that's still a real computed
  // value the >20% check should apply to, not "OSRM unreachable, skip the check".
  if (leg.directDistanceKm == null) return true
  return (
    leg.distanceKm <= leg.directDistanceKm * 1.2 || (leg.justificationNote?.trim().length ?? 0) > 0
  )
}

/**
 * Fallback board-approval distance cap, used when the caller doesn't pass one.
 * The deployed value comes from MILEAGE_MAX_KM, which only the backend can read —
 * see routes/expenses/api.ts, which passes it in at every parse site. Mirrors the
 * frontend's VITE_MILEAGE_MAX_KM (ExpenseClaimForm.tsx / ExpenseClaimWizard.tsx),
 * which only gates the UI — the refine below is the actual enforcement, since a
 * client can otherwise submit any distance with boardApproved left false or
 * spoofed true unchecked.
 */
export const DEFAULT_MILEAGE_MAX_KM = 100

export const createMileageLegSchema = (maxKm: number = DEFAULT_MILEAGE_MAX_KM) =>
  MileageLegBaseSchema.omit({
    id: true,
    claimId: true,
    route: true,
    ratePerKm: true,
  })
    .refine(hasRequiredJustification, {
      message:
        'A justification note is required when the distance exceeds the direct route by more than 20%',
      path: ['justificationNote'],
    })
    .refine((leg) => leg.distanceKm <= maxKm || leg.boardApproved, {
      message: 'Board approval is required for legs above the maximum distance',
      path: ['boardApproved'],
    })

export const CreateMileageLegSchema = createMileageLegSchema()
export type CreateMileageLeg = z.infer<typeof CreateMileageLegSchema>

// ─── HETU access log (issue #1022) ───────────────────────────────────────────

export const MileageHetuAccessLogEntrySchema = z.object({
  accessedAt: z.string(),
  accessedByName: z.string(),
})
export type MileageHetuAccessLogEntry = z.infer<typeof MileageHetuAccessLogEntrySchema>
