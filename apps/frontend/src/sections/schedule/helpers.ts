import { BookingListResponse, BookingStatus } from '@mik/contracts/bookings'
import dayjs, { Dayjs } from 'dayjs'
import { useMe } from '../../hooks/useMe'

export const bookingMinDate = (startTime?: Dayjs) => {
  const now = dayjs()
  const isStartedBooking = startTime && startTime.isBefore(now)

  return isStartedBooking
    ? // start date is locked when booking has already started
      startTime
    : // earliest the next quarter
      now.startOf('minute').add(15 - (now.minute() % 15), 'minute')
}

export const bookingFlags = (
  booking: BookingListResponse['bookings'][0],
  me: ReturnType<typeof useMe>['me'],
  isBookingAdmin: boolean,
) => {
  const editPermissions =
    booking.memberId === me?.memberId ||
    (!!booking.instructorMemberId && booking.instructorMemberId === me?.memberId) ||
    isBookingAdmin

  const isCancelled = booking.status === BookingStatus.CANCELLED
  const isPastBooking = dayjs(booking.endTime).isBefore()

  const isReadonly = !editPermissions || isCancelled || isPastBooking

  return {
    isNewBooking: false,
    isReadonly,
    isCancelled,
    isPastBooking,
    minDate: bookingMinDate(dayjs(booking.startTime)),
  }
}
