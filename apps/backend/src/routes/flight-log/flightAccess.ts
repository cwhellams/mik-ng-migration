import { type FlightLog, FlightLogStatus, ON_BOARD_CREW_ROLES } from '@mik/contracts/flight-log'
import { MIKPermissions } from '@mik/contracts/members'

import type { JWTUser } from '../auth/token.ts'

/**
 * How the requesting member is related to a flight log. Read access and write access are
 * deliberately separate questions — see `canReadFlight` / `canWriteFlight` — because a
 * member's own flight log now contains flights they flew but are not billed for (#1019),
 * and the helper that fetches a flight for reading is the same one the PATCH, DELETE and
 * validate routes use. Widening it without splitting the two would have handed an
 * instructor the ability to delete a student's flight.
 */
export enum FlightAccess {
  /** flightlog admin in sudo mode: everything, on any flight. */
  ADMIN = 'ADMIN',
  /** The member the flight is billed to. */
  OWNER = 'OWNER',
  /**
   * On board as operating crew and holding `dto.instructor`. May edit the flight exactly
   * as the billable member would, for as long as it is still editable (#1019 Q5, Q7).
   */
  INSTRUCTOR_CREW = 'INSTRUCTOR_CREW',
  /** On board as operating crew, without instructor rights: read-only. */
  CREW = 'CREW',
  /** Not their flight in any sense. */
  NONE = 'NONE',
}

export const isFlightLogAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN) ?? false

const isDtoInstructor = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.DTO_INSTRUCTOR) ?? false

/**
 * Whether `memberId` occupied one of the four crew slots in an operating role. Mirrors
 * `onBoardAsCrew` in flight-log-queries.ts, which is the SQL half of the same rule: an
 * OBS slot means the member was carried, not that they flew.
 */
export const isOnBoardAsCrew = (flight: FlightLog, memberId: string | undefined): boolean => {
  if (!memberId) return false
  const roles: readonly string[] = ON_BOARD_CREW_ROLES
  return (
    [
      [flight.picMemberId, flight.picRole],
      [flight.crew2MemberId, flight.crew2Role],
      [flight.crew3MemberId, flight.crew3Role],
      [flight.crew4MemberId, flight.crew4Role],
    ] as [string | null, string | null][]
  ).some(([slotMemberId, role]) => slotMemberId === memberId && roles.includes(role ?? ''))
}

export const resolveFlightAccess = (flight: FlightLog, user?: JWTUser): FlightAccess => {
  // Ownership is checked before admin so an admin looking at their own flight is not
  // told they are a stranger to it — the two grant the same reads, but OWNER is the
  // truer description and keeps the billing fields visible outside sudo mode.
  if (flight.billableMemberId === user?.memberId) return FlightAccess.OWNER
  if (isFlightLogAdmin(user)) return FlightAccess.ADMIN
  if (isOnBoardAsCrew(flight, user?.memberId)) {
    return isDtoInstructor(user) ? FlightAccess.INSTRUCTOR_CREW : FlightAccess.CREW
  }
  return FlightAccess.NONE
}

export const canReadFlight = (access: FlightAccess): boolean => access !== FlightAccess.NONE

/**
 * Whether this access level may PATCH the flight in its current state.
 *
 * An instructor's window closes when the flight is validated: from then on the billable
 * member is editing remarks on an entry that is on its way to an invoice, and that is
 * between them and the billing admin. Owners and admins keep the wider rights the
 * per-status schemas in `getValidPatchForUpdate` already describe.
 */
export const canWriteFlight = (access: FlightAccess, status: FlightLogStatus): boolean => {
  switch (access) {
    case FlightAccess.ADMIN:
    case FlightAccess.OWNER:
      return true
    case FlightAccess.INSTRUCTOR_CREW:
      return status === FlightLogStatus.NEW
    default:
      return false
  }
}

/**
 * The fields that describe what the flight costs the billable member and what they
 * privately wrote about it. A crew member reading someone else's flight sees the
 * operational entry — times, aircraft, airports, landings, fuel, what happened — and
 * none of this.
 *
 * Contract (camelCase) field names, because the same list also filters the audit trail,
 * whose diff reports contract names.
 */
export const FLIGHT_LOG_BILLING_FIELDS = [
  'billingRemarks',
  'personalRemarks',
  'invoiceNumber',
  'isBilled',
  'entryErrorFee',
  'entryErrorFeeAppliedByMemberId',
  'nonBillingReason',
  'nonBillingApprovedByMemberId',
  'minBillableExceptionReason',
  'minBillableExceptionApprovedByMemberId',
  'validationRemarks',
] as const satisfies readonly (keyof FlightLog)[]

/**
 * Whether this reader may see the fields above.
 *
 * An instructor sees them only while they may still edit: full parity with the billable
 * member is the point while the entry is being corrected, but once it is validated the
 * instructor has no reason to know the student's invoice number or entry-error fee.
 */
export const canSeeBillingFields = (access: FlightAccess, status: FlightLogStatus): boolean =>
  access === FlightAccess.ADMIN ||
  access === FlightAccess.OWNER ||
  (access === FlightAccess.INSTRUCTOR_CREW && canWriteFlight(access, status))

/**
 * The flight as a crew member who is not billed for it may see it. `status` is kept
 * deliberately: a crew member sees the true state of a flight they flew, the same as any
 * other crew member on it, rather than the plausible-but-wrong VALIDATED the list used to
 * show for everyone else's flights (#1019 Q4).
 */
export const redactBillingFields = (flight: FlightLog): FlightLog => ({
  ...flight,
  billingRemarks: null,
  personalRemarks: null,
  invoiceNumber: null,
  isBilled: false,
  entryErrorFee: false,
  entryErrorFeeAppliedByMemberId: null,
  nonBillingReason: null,
  nonBillingApprovedByMemberId: null,
  minBillableExceptionReason: null,
  minBillableExceptionApprovedByMemberId: null,
  validationRemarks: null,
})
