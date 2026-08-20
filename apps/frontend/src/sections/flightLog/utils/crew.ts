import {
  type CrewRole,
  type FlightLog,
  type FlightLogListEntry,
  ON_BOARD_CREW_ROLES,
} from '@mik/contracts/flight-log'

/**
 * The role a member flew in on this flight, from whichever of the four crew slots they
 * occupied, or null if they were not on board as operating crew.
 *
 * An OBS slot counts as not on board: the member was carried, not flying, so the flight
 * is not theirs to open or edit (#1019 Q6). The same rule is applied server-side in
 * `flightAccess.ts` and in SQL in `flight-log-queries.ts` — this copy only decides what
 * the form offers, never what is allowed.
 *
 * The list endpoint sends `myCrewRole` ready-made; this is for the detail response, which
 * carries the raw crew slots because the member may be editing them.
 */
export const myCrewRoleOn = (flight: FlightLog, memberId: string | undefined): CrewRole | null => {
  if (!memberId) return null
  const slots: [string | null, CrewRole | null][] = [
    [flight.picMemberId, flight.picRole],
    [flight.crew2MemberId, flight.crew2Role],
    [flight.crew3MemberId, flight.crew3Role],
    [flight.crew4MemberId, flight.crew4Role],
  ]
  const mine = slots.find(([slotMemberId]) => slotMemberId === memberId)
  const role = mine?.[1] ?? null
  return role && (ON_BOARD_CREW_ROLES as readonly CrewRole[]).includes(role) ? role : null
}

/**
 * Whether this member may open a flight-log row.
 *
 * Shared by their own flight log and by the aircraft logbook (AJLB) page, which list the
 * same rows and used to disagree the moment one of them learned about crew flights. The
 * backend decides the real thing — see `flightAccess.ts`; this only decides whether the
 * row is rendered as a link, and must not offer one the server would refuse.
 *
 * `isOwnFlight` is the server's own answer to "is this billed to the viewer"; the
 * `billableMemberId` comparison next to it covers a list fetched without a viewer, where
 * the derived fields come back inert.
 */
export const canOpenFlightRow = (
  log: Pick<FlightLogListEntry, 'billableMemberId' | 'isOwnFlight' | 'myCrewRole'>,
  memberId: string | undefined,
  isFlightLogAdmin: boolean,
): boolean =>
  isFlightLogAdmin || log.isOwnFlight || log.billableMemberId === memberId || log.myCrewRole != null
