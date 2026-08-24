import {
  BookingStatus,
  BookingType,
  type Booking,
  type BookingListResponse,
} from '@mik/contracts/bookings'

import {
  AIRCRAFT_REGISTRATION,
  auditFields,
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
} from '@mik/ui/test/fixtures/cast'

/** 2025-06-02 09:00–11:00 UTC. Fixed so schedule rendering is deterministic. */
const START = Date.UTC(2025, 5, 2, 9, 0, 0)
const END = Date.UTC(2025, 5, 2, 11, 0, 0)

const epochSeconds = (ms: number) => String(Math.floor(ms / 1000))

/** A confirmed training booking for `Matti1` on `OH-STL` with `Jukka1` instructing. */
export const aBooking = (overrides: Partial<Booking> = {}): Booking => ({
  bookingId: 'stl1',
  memberId: MEMBER_ID,
  member: { firstName: 'Matti', lastName: 'Virtanen', phoneNumber: '0401234567' },
  instructorMemberId: INSTRUCTOR_MEMBER_ID,
  instructor: { firstName: 'Jukka', lastName: 'Nieminen', phoneNumber: '0409876543' },
  registration: AIRCRAFT_REGISTRATION,
  type: BookingType.TRAINING,
  status: BookingStatus.CONFIRMED,
  startTimeEpoch: epochSeconds(START),
  startTime: new Date(START).toISOString(),
  endTimeEpoch: epochSeconds(END),
  endTime: new Date(END).toISOString(),
  description: 'Training flight',
  calendarSequence: 0,
  cancelledBy: null,
  cancelledAt: null,
  cancellationReason: null,
  cancellationNote: null,

  ...auditFields(MEMBER_ID),
  ...overrides,
})

export const aBookingListResponse = (bookings: Booking[] = [aBooking()]): BookingListResponse => ({
  bookings,
})
