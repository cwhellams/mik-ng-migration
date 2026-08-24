import { describe, expect, it } from 'vitest'

import { aFlightLog, aFlightLogListEntry } from '../../../test/fixtures'
import {
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
  NO_PERMISSIONS_MEMBER_ID,
} from '@mik/ui/test/fixtures/cast'
import { canOpenFlightRow, myCrewRoleOn } from './crew'

describe('myCrewRoleOn', () => {
  it('finds the role from the slot the member occupied', () => {
    // The fixture is a dual training flight: Matti1 in slot 1 as the student, Jukka1 in
    // crew 2 as the instructor. Slot 1 is not the same thing as "the PIC".
    const flight = aFlightLog()

    expect(myCrewRoleOn(flight, MEMBER_ID)).toEqual('STU')
    expect(myCrewRoleOn(flight, INSTRUCTOR_MEMBER_ID)).toEqual('FI')
  })

  it('finds a PIC slot too', () => {
    expect(myCrewRoleOn(aFlightLog({ picRole: 'PIC' }), MEMBER_ID)).toEqual('PIC')
  })

  it('finds the role in the later crew slots too', () => {
    const flight = aFlightLog({ crew3MemberId: NO_PERMISSIONS_MEMBER_ID, crew3Role: 'STU' })
    expect(myCrewRoleOn(flight, NO_PERMISSIONS_MEMBER_ID)).toEqual('STU')

    const fourth = aFlightLog({ crew4MemberId: NO_PERMISSIONS_MEMBER_ID, crew4Role: 'FE' })
    expect(myCrewRoleOn(fourth, NO_PERMISSIONS_MEMBER_ID)).toEqual('FE')
  })

  it('returns null for a member who was not on board', () => {
    expect(myCrewRoleOn(aFlightLog(), 'Sanna1')).toBeNull()
  })

  it('returns null when there is no signed-in member yet', () => {
    expect(myCrewRoleOn(aFlightLog(), undefined)).toBeNull()
  })

  it('treats an observer seat as not on board', () => {
    // An OBS was carried, not flying, so the flight is not theirs to open or edit
    // (#1019 Q6) — the same rule the backend applies in flightAccess.ts and in SQL.
    const flight = aFlightLog({ crew2Role: 'OBS' })
    expect(myCrewRoleOn(flight, INSTRUCTOR_MEMBER_ID)).toBeNull()
  })

  it('returns null for the member being billed when they were not on board', () => {
    // The instructor-with-student case in reverse: whoever pays for the flight is not
    // necessarily on it, and only a crew slot puts the flight in someone's logbook.
    const flight = aFlightLog({
      billableMemberId: 'Sanna1',
      picMemberId: MEMBER_ID,
      crew2MemberId: INSTRUCTOR_MEMBER_ID,
    })
    expect(myCrewRoleOn(flight, 'Sanna1')).toBeNull()
  })
})

describe('canOpenFlightRow', () => {
  const ownRow = aFlightLogListEntry({
    billableMemberId: MEMBER_ID,
    isOwnFlight: true,
    myCrewRole: 'STU',
  })
  const crewRow = aFlightLogListEntry({
    billableMemberId: INSTRUCTOR_MEMBER_ID,
    isOwnFlight: false,
    myCrewRole: 'STU',
  })
  const strangerRow = aFlightLogListEntry({
    billableMemberId: INSTRUCTOR_MEMBER_ID,
    isOwnFlight: false,
    myCrewRole: null,
  })

  it('opens the flights the member is billed for', () => {
    expect(canOpenFlightRow(ownRow, MEMBER_ID, false)).toBe(true)
  })

  it('opens a flight the member flew as crew but is not billed for', () => {
    // The gap #1019 closes: this row used to render as unopenable text.
    expect(canOpenFlightRow(crewRow, MEMBER_ID, false)).toBe(true)
  })

  it('does not open a flight the member had no part in', () => {
    expect(canOpenFlightRow(strangerRow, MEMBER_ID, false)).toBe(false)
  })

  it('opens anything for a flightlog admin in sudo mode', () => {
    expect(canOpenFlightRow(strangerRow, MEMBER_ID, true)).toBe(true)
  })

  it('falls back to the billable member id when the list was fetched without a viewer', () => {
    // An aircraft logbook page fetched server-side without a viewer comes back with both
    // derived fields inert, so the row still has to be openable by whoever pays for it.
    const inert = aFlightLogListEntry({
      billableMemberId: MEMBER_ID,
      isOwnFlight: false,
      myCrewRole: null,
    })
    expect(canOpenFlightRow(inert, MEMBER_ID, false)).toBe(true)
    expect(canOpenFlightRow(inert, INSTRUCTOR_MEMBER_ID, false)).toBe(false)
  })

  it('opens nothing for a visitor with no member id yet', () => {
    expect(canOpenFlightRow(strangerRow, undefined, false)).toBe(false)
  })
})
