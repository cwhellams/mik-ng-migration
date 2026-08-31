import { BookingStatus } from '@mik/contracts/bookings'
import dayjs from 'dayjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  aBooking,
  aMember,
  aMemberListEntry,
  anInstructor,
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
  NO_PERMISSIONS_MEMBER_ID,
  SECOND_INSTRUCTOR_MEMBER_ID,
} from '../../test/fixtures'
import { bookingFlags, bookingMinDate, defaultInstructorFor } from './helpers'

afterEach(() => vi.useRealTimers())

const freezeAt = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

/** The fixture booking runs 2025-06-02 09:00–11:00Z on OH-STL, booked by Matti1. */
const BEFORE_THE_BOOKING = '2025-06-01T09:00:00Z'
const AFTER_THE_BOOKING = '2025-06-03T09:00:00Z'

describe('bookingMinDate', () => {
  it('rounds up to the next quarter hour', () => {
    freezeAt('2025-06-02T09:07:30Z')

    expect(bookingMinDate().format('HH:mm:ss')).toBe(
      dayjs('2025-06-02T09:15:00Z').format('HH:mm:ss'),
    )
  })

  it('drops the seconds when rounding', () => {
    freezeAt('2025-06-02T09:07:30Z')

    expect(bookingMinDate().second()).toBe(0)
    expect(bookingMinDate().millisecond()).toBe(0)
  })

  it('moves to the following quarter when already exactly on one', () => {
    // 09:15 does not stay at 09:15 — the earliest bookable slot is 09:30.
    freezeAt('2025-06-02T09:15:00Z')

    expect(bookingMinDate().format('HH:mm')).toBe(dayjs('2025-06-02T09:30:00Z').format('HH:mm'))
  })

  it('rolls into the next hour from the last quarter', () => {
    freezeAt('2025-06-02T09:50:00Z')

    expect(bookingMinDate().format('HH:mm')).toBe(dayjs('2025-06-02T10:00:00Z').format('HH:mm'))
  })

  it('locks the start time of a booking that has already begun', () => {
    freezeAt('2025-06-02T10:00:00Z')
    const startTime = dayjs('2025-06-02T09:00:00Z')

    expect(bookingMinDate(startTime).valueOf()).toBe(startTime.valueOf())
  })

  it('still rounds up for a booking that has not started yet', () => {
    freezeAt('2025-06-02T09:07:30Z')

    expect(bookingMinDate(dayjs('2025-06-02T14:00:00Z')).format('HH:mm')).toBe(
      dayjs('2025-06-02T09:15:00Z').format('HH:mm'),
    )
  })
})

describe('bookingFlags', () => {
  it('lets the member who made the booking edit it', () => {
    freezeAt(BEFORE_THE_BOOKING)

    expect(bookingFlags(aBooking(), aMember(), false)).toMatchObject({
      isNewBooking: false,
      isReadonly: false,
      isCancelled: false,
      isPastBooking: false,
    })
  })

  it('lets the assigned instructor edit it', () => {
    freezeAt(BEFORE_THE_BOOKING)

    expect(bookingFlags(aBooking(), anInstructor(), false).isReadonly).toBe(false)
  })

  it('lets a booking admin edit someone else’s booking', () => {
    freezeAt(BEFORE_THE_BOOKING)
    const someoneElse = aMember({ memberId: 'Anna1' })

    expect(bookingFlags(aBooking(), someoneElse, true).isReadonly).toBe(false)
  })

  it('is read-only for an unrelated member', () => {
    freezeAt(BEFORE_THE_BOOKING)
    const someoneElse = aMember({ memberId: 'Anna1' })

    expect(bookingFlags(aBooking(), someoneElse, false).isReadonly).toBe(true)
  })

  it('is read-only when nobody is signed in', () => {
    freezeAt(BEFORE_THE_BOOKING)

    expect(bookingFlags(aBooking(), null, false).isReadonly).toBe(true)
  })

  it('does not treat an empty instructor slot as a match for a signed-out user', () => {
    freezeAt(BEFORE_THE_BOOKING)
    const unassigned = aBooking({ memberId: 'Anna1', instructorMemberId: null })

    // Both sides being nullish must not count as "this is my booking".
    expect(bookingFlags(unassigned, undefined, false).isReadonly).toBe(true)
  })

  it('is read-only once cancelled, even for the owner', () => {
    freezeAt(BEFORE_THE_BOOKING)
    const cancelled = aBooking({ status: BookingStatus.CANCELLED })

    expect(bookingFlags(cancelled, aMember(), false)).toMatchObject({
      isCancelled: true,
      isReadonly: true,
    })
  })

  it('is read-only once the booking is in the past, even for an admin', () => {
    freezeAt(AFTER_THE_BOOKING)

    expect(bookingFlags(aBooking(), aMember(), true)).toMatchObject({
      isPastBooking: true,
      isReadonly: true,
    })
  })

  it('is still editable while the booking is running', () => {
    freezeAt('2025-06-02T10:00:00Z')

    expect(bookingFlags(aBooking(), aMember(), false)).toMatchObject({
      isPastBooking: false,
      isReadonly: false,
    })
  })

  it('locks the min date to the start time of a running booking', () => {
    freezeAt('2025-06-02T10:00:00Z')

    expect(bookingFlags(aBooking(), aMember(), false).minDate.valueOf()).toBe(
      dayjs(aBooking().startTime).valueOf(),
    )
  })

  it('reports the booking’s own member and instructor ids from the shared fixture', () => {
    // Guards against the fixture drifting away from the ids these tests rely on.
    expect(aBooking().memberId).toBe(MEMBER_ID)
    expect(aBooking().instructorMemberId).toBe(INSTRUCTOR_MEMBER_ID)
  })
})

describe('defaultInstructorFor', () => {
  /** The Instructor / FE picker's options: `GET v1/members?role=INSTRUCTOR&role=EXAMINER`. */
  const instructors = [aMemberListEntry({ memberId: INSTRUCTOR_MEMBER_ID })]

  const student = (defaultInstructorMemberId: string | null) =>
    aMember({ memberId: MEMBER_ID, defaultInstructorMemberId })

  it('offers the member’s default instructor for their own booking', () => {
    expect(defaultInstructorFor(student(INSTRUCTOR_MEMBER_ID), MEMBER_ID, instructors)).toBe(
      INSTRUCTOR_MEMBER_ID,
    )
  })

  it('offers nothing when the member has not set a default instructor', () => {
    expect(defaultInstructorFor(student(null), MEMBER_ID, instructors)).toBeNull()
  })

  it('offers nothing when nobody is signed in', () => {
    expect(defaultInstructorFor(null, MEMBER_ID, instructors)).toBeNull()
    expect(defaultInstructorFor(undefined, MEMBER_ID, instructors)).toBeNull()
  })

  // The booking admin case. Inheriting the admin's own default instructor onto a
  // student's booking would name the wrong person, and the student's own default is
  // not on the wire to use instead.
  it('offers nothing on another member’s booking', () => {
    expect(
      defaultInstructorFor(student(INSTRUCTOR_MEMBER_ID), NO_PERMISSIONS_MEMBER_ID, instructors),
    ).toBeNull()
  })

  it('offers nothing when the booking has no owner yet', () => {
    expect(defaultInstructorFor(student(INSTRUCTOR_MEMBER_ID), undefined, instructors)).toBeNull()
  })

  // A default instructor who has since lost the role is absent from the picker's
  // options: setting the id anyway would leave the field looking empty while Save
  // stayed enabled, and the backend's validateInstructor would then answer 400.
  it('offers nothing when the default instructor no longer holds the role', () => {
    expect(
      defaultInstructorFor(student(INSTRUCTOR_MEMBER_ID), MEMBER_ID, [
        aMemberListEntry({ memberId: SECOND_INSTRUCTOR_MEMBER_ID }),
      ]),
    ).toBeNull()
  })

  it('offers nothing before the instructor list has loaded', () => {
    expect(defaultInstructorFor(student(INSTRUCTOR_MEMBER_ID), MEMBER_ID, [])).toBeNull()
  })
})
