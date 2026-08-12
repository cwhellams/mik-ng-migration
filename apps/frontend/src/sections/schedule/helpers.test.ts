import { BookingStatus } from '@mik/contracts/bookings'
import dayjs from 'dayjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  aBooking,
  aMember,
  anInstructor,
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
} from '../../test/fixtures'
import { bookingFlags, bookingMinDate } from './helpers'

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
