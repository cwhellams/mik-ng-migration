import { BookingListResponse, BookingStatus } from '@mik/contracts/bookings'
import type { MemberList } from '@mik/contracts/members'
import dayjs, { Dayjs } from 'dayjs'
import { useMe } from '@mik/ui/hooks/useMe'

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

/**
 * The instructor a training booking should start out with, or `null` for "leave the
 * field empty and required".
 *
 * The member's `defaultInstructorMemberId` — the same value that pre-fills the
 * instructor crew slot when logging a school flight (`flightLog/components/FlightCrew`) —
 * saves them naming the same person on every training booking. Three conditions have to
 * hold, and none of them is incidental:
 *
 * - **The booking must be the signed-in member's own.** A booking admin editing somebody
 *   else's booking would otherwise inherit *their own* default instructor onto a student's
 *   booking. Creating a booking for another member isn't something the UI offers at all
 *   (`Schedule.tsx` always books for `me`), so in practice this only guards the admin edit
 *   path — and the student's own default isn't on the wire to use instead: the booking's
 *   embedded `member` carries only name and phone number (#1304).
 * - **The instructor must be one the picker can display.** A default instructor who has
 *   since lost the INSTRUCTOR role is not in `instructors`, and setting the id regardless
 *   would leave the Autocomplete visually empty while the form's
 *   `isTrainingWithoutInstructor` read false — Save enabled, then a 400 from the backend's
 *   `validateInstructor`. Empty-and-required is the honest answer, and deliberately a
 *   silent one (#1304).
 * - **`instructors` must have loaded.** It is fetched when the editor opens rather than
 *   when Training is picked, so by the time anyone reaches the type select it is there;
 *   picking Training inside that first fetch simply leaves today's behaviour.
 *
 * Whether an *already chosen* instructor may be overwritten is not this function's call —
 * the caller decides that, because it is the one that knows a type change is happening.
 */
export const defaultInstructorFor = (
  me: ReturnType<typeof useMe>['me'],
  bookingMemberId: string | undefined,
  instructors: MemberList[],
): string | null => {
  const defaultInstructorMemberId = me?.defaultInstructorMemberId
  if (!defaultInstructorMemberId || !bookingMemberId || bookingMemberId !== me?.memberId) {
    return null
  }

  return instructors.some((instructor) => instructor.memberId === defaultInstructorMemberId)
    ? defaultInstructorMemberId
    : null
}
