import * as bookingQueries from '../../src/db/booking-queries.ts'
import {
  BookingStatus,
  BookingType,
  type Booking,
  type BookingUpsertRequest,
} from '../../src/routes/bookings/models.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import dayjs from 'dayjs'

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  lastName: 'Test',
  email: 'loggedinuser',
  roles: [],
  permissions: [],
}

describe('Db Get Booking by id', () => {
  it('getBookings without filters', async () => {
    const result = await bookingQueries.getBookingById('stl1')
    expect(result).toEqual({
      bookingId: 'stl1',
      cancelledAt: undefined,
      cancelledBy: null,
      createdAt: expect.any(String),
      createdBy: 'Liisa1',
      description: undefined,
      endTime: expect.any(String),
      endTimeEpoch: expect.any(String),
      member: {
        firstName: expect.any(String),
        lastName: expect.any(String),
        phoneNumber: expect.any(String),
      },
      memberId: expect.any(String),
      registration: 'OH-STL',
      startTime: expect.any(String),
      startTimeEpoch: expect.any(String),
      status: 'CONFIRMED',
      type: 'TRAINING',
      updatedAt: expect.any(String),
      updatedBy: 'Liisa1',
    })
  })
})

describe('Db Get Bookings', () => {
  it('get test data bookings from single plane', async () => {
    const result = await bookingQueries.getBookings({
      'registration[]': ['OH-STL'],
      from: dayjs().startOf('day').toISOString(),
      showCancelled: true,
    })
    expect(result.length).toEqual(20)
    expect(result[0].bookingId).toEqual('stl1')
  })

  it('getBookings in reverse order with limit', async () => {
    const result = await bookingQueries.getBookings({
      orderLatestFirst: true,
      limit: 1,
    })
    expect(result.length).toEqual(1)
    expect(result[0].bookingId).toEqual('stl20')
  })

  it('getBookings with all filters', async () => {
    const all = await bookingQueries.getBookings({
      'registration[]': ['OH-STL'],
      from: dayjs().startOf('day').toISOString(),
    })
    const first = all[0]

    const result = await bookingQueries.getBookings({
      from: first.startTime,
      to: first.endTime,
      'registration[]': first.registration,
      memberId: first.memberId,
    })
    expect(result.length).toEqual(1)
    expect(result[0]).toEqual(first)
  })
})

// prevent overlaps with previous bookings
const now = dayjs()
  .startOf('day')
  .subtract(1, 'year')
  .add(Math.round(Math.random() * 8000), 'hour')

const startTime = now
const endTime = now.add(1, 'hour')

describe('Db Booking insert, update, cancel', () => {
  const testBooking = (overrides?: Partial<BookingUpsertRequest>): BookingUpsertRequest => ({
    memberId: jwt.memberId!,
    registration: 'OH-STL',
    status: BookingStatus.CONFIRMED,
    type: BookingType.TRAINING,
    description: 'Test booking',
    startTimeEpoch: startTime.unix().toString(),
    endTimeEpoch: endTime.unix().toString(),
    ...overrides,
  })

  const expectBookingToMatch = (result: Booking, overrides?: Partial<BookingUpsertRequest>) => {
    expect(result).toEqual({
      bookingId: expect.any(String),
      createdAt: expect.any(String),
      createdBy: 'k1mnimda',
      description: 'Test booking',
      endTime: (overrides?.endTimeEpoch
        ? dayjs.unix(Number(overrides?.endTimeEpoch))
        : endTime
      ).toISOString(),
      endTimeEpoch: endTime.unix().toString(),
      member: {
        firstName: '',
        lastName: '',
        phoneNumber: null,
      },
      memberId: jwt.memberId!,
      registration: 'OH-STL',
      startTime: (overrides?.startTimeEpoch
        ? dayjs.unix(Number(overrides?.startTimeEpoch))
        : startTime
      ).toISOString(),
      startTimeEpoch: startTime.unix().toString(),
      status: 'CONFIRMED',
      type: 'TRAINING',
      updatedAt: expect.any(String),
      updatedBy: 'k1mnimda',
      ...overrides,
    })
  }

  it('inserts and fetches a booking', async () => {
    const booking = await bookingQueries.insertBooking(testBooking(), jwt)
    await expectBookingToMatch(booking)

    const result = await bookingQueries.getBookingById(booking.bookingId)
    expect(result).toEqual({
      ...booking,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      cancelledBy: null,
      member: {
        firstName: 'MIK',
        lastName: 'Admin',
        phoneNumber: null,
      },
    })
  })

  it('start and end date cannot be the same', async () => {
    await expect(
      bookingQueries.insertBooking(
        testBooking({
          endTimeEpoch: startTime.unix().toString(),
        }),
        jwt,
      ),
    ).rejects.toThrow(
      'new row for relation "bookings" violates check constraint "check_booking_time_sequence"',
    )
  })

  it('no overlaps allowed with identical times', async () => {
    await expect(bookingQueries.insertBooking(testBooking({}), jwt)).rejects.toThrow(
      'Overlapping booking',
    )
  })

  it('no overlaps allowed with outside existing booking', async () => {
    await expect(
      bookingQueries.insertBooking(
        testBooking({
          startTimeEpoch: startTime.subtract(1, 'hour').unix().toString(),
          endTimeEpoch: endTime.add(1, 'hour').unix().toString(),
        }),
        jwt,
      ),
    ).rejects.toThrow('Overlapping booking')
  })

  it('no overlaps allowed inside existing booking', async () => {
    await expect(
      bookingQueries.insertBooking(
        testBooking({
          startTimeEpoch: startTime.add(15, 'minutes').unix().toString(),
          endTimeEpoch: endTime.subtract(15, 'minutes').unix().toString(),
        }),
        jwt,
      ),
    ).rejects.toThrow('Overlapping booking')
  })

  it('insert booking right before existing booking', async () => {
    const booking = await bookingQueries.insertBooking(
      testBooking({
        startTimeEpoch: startTime.subtract(1, 'hour').unix().toString(),
        endTimeEpoch: startTime.unix().toString(),
      }),
      jwt,
    )
    await expectBookingToMatch(booking, {
      startTimeEpoch: startTime.subtract(1, 'hour').unix().toString(),
      endTimeEpoch: startTime.unix().toString(),
    })
  })

  it('insert booking right after existing booking', async () => {
    const booking = await bookingQueries.insertBooking(
      testBooking({
        startTimeEpoch: endTime.unix().toString(),
        endTimeEpoch: endTime.add(1, 'hour').unix().toString(),
      }),
      jwt,
    )
    await expectBookingToMatch(booking, {
      startTimeEpoch: endTime.unix().toString(),
      endTimeEpoch: endTime.add(1, 'hour').unix().toString(),
    })
  })

  it('insert overlapping booking for another plane', async () => {
    const booking = await bookingQueries.insertBooking(
      testBooking({
        registration: 'OH-IHQ',
        startTimeEpoch: startTime.unix().toString(),
        endTimeEpoch: endTime.unix().toString(),
      }),
      jwt,
    )
    await expectBookingToMatch(booking, { registration: 'OH-IHQ' })
  })
})

describe('Db Booking update', () => {
  it('update booking', async () => {
    const booking = await bookingQueries.updateBooking(
      'stl2',
      {
        description: 'Updated description',
      },
      jwt,
    )
    expect(booking?.description).toEqual('Updated description')
    expect(booking?.updatedBy).toEqual(jwt.memberId)

    await bookingQueries.updateBooking(
      'stl2',
      {
        description: undefined,
      },
      jwt,
    )
  })

  it('no overlaps allowed', async () => {
    await expect(
      bookingQueries.updateBooking(
        'stl2',
        {
          startTimeEpoch: startTime.add(15, 'minutes').unix().toString(),
          endTimeEpoch: endTime.subtract(15, 'minutes').unix().toString(),
        },
        jwt,
      ),
    ).rejects.toThrow('Overlapping booking')
  })
})

describe('Db Booking cancel', () => {
  it('cancel booking', async () => {
    const booking = await bookingQueries.cancelBooking('stl2', jwt)
    expect(booking?.status).toEqual(BookingStatus.CANCELLED)
    expect(booking?.cancelledAt).toBeDefined()
    expect(booking?.cancelledBy).toEqual(jwt.memberId)
  })
})
