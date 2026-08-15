import { Router, type Request, type Response } from 'express'

import {
  BookingFiltersSchema,
  BookingStatus,
  BookingType,
  BookingUpsertSchema,
  CancellationRequestSchema,
  TransferBookingSchema,
  type Booking,
  type BookingFilters,
  type BookingListResponse,
  type BookingUpsertRequest,
} from '@mik/contracts/bookings'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { type JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import {
  cancelBooking,
  getBookingById,
  getBookings,
  insertBooking,
  updateBooking,
} from '../../db/booking-queries.ts'
import dayjs from 'dayjs'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getMemberById, getMemberRolesByMemberId } from '../../db/member-queries.ts'
import { renderEmail } from '../../templates/renderEmail.ts'
import { bookingEmailVars } from '../../templates/bookingEmailHelpers.ts'
import { generateIcsContent, generateCancelIcsContent } from '../../lib/calendarEvent.ts'

// all scheduling routes are protected by booking permissions
const router = Router()
router.use(validateUser(MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN))

const isBookingAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.BOOKING_ADMIN) ?? false

// Create a booking
router.post('/', async (req: Request<Record<string, string>>, res: Response) => {
  const data = BookingUpsertSchema.parse(req.body)

  // only admin can create bookings for other members
  const isAdmin = isBookingAdmin(req.user)
  if (!isAdmin && data.memberId !== req.user!.memberId) {
    return problem({ status: 400, detail: 'Invalid member id' })
  }

  if (!isAdmin && req.user?.canMakeReservations !== true) {
    return problem({ status: 400, detail: 'Reservations suspended' })
  }

  const instructorError = await validateInstructor(data.type, data.instructorMemberId)
  if (instructorError) return instructorError

  await clearOverlappingBookings(
    {
      ...data,
      bookingId: '',
    },
    req.user!,
  )

  const booking = await insertBooking(data, req.user!)

  const member = await getMemberById(booking.memberId)
  if (member?.email) {
    const { subject, html } = renderEmail(
      'booking-confirmed',
      member.lang,
      bookingEmailVars(booking, { firstName: member.firstName }),
    )
    sendEmail(member.email, subject, html, [
      {
        filename: 'booking.ics',
        content: generateIcsContent(booking, member.email),
        contentType: 'text/calendar',
      },
    ])
  }
  notifyInstructor(booking.instructorMemberId, booking, memberFullName(member), 'confirmed')

  res.status(201).json(booking)
})

// Get bookings
router.get('/', async (req: Request<BookingFilters>, res: Response<BookingListResponse>) => {
  const data = BookingFiltersSchema.parse(req.query)

  // Non-admins can view the full shared schedule (no memberId filter), or filter to their
  // own bookings, but cannot filter by another member's memberId.
  if (!isBookingAdmin(req.user) && data.memberId && data.memberId !== req.user!.memberId) {
    return problem({ status: 403, detail: 'Cannot query bookings for another member' })
  }
  const filters: BookingFilters = { ...data }

  const previous = filters.from
    ? await getBookings({
        ...filters,
        registration: filters.registration,
        from: undefined,
        to: filters.from,
        orderLatestFirst: true,
        limit: 1,
      })
    : []
  const bookings = await getBookings(filters)
  const next = filters.to
    ? await getBookings({
        ...filters,
        registration: filters.registration,
        from: filters.to,
        to: undefined,
        limit: 1,
      })
    : []
  res.status(200).json({
    bookings,
    previous: previous?.[0],
    next: next?.[0],
  })
})

const validateWriteAccess = (
  booking: Pick<Booking, 'memberId' | 'instructorMemberId'>,
  req: Request<Record<string, string>>,
) => {
  // Check if the booking is owned by the user, user is the assigned instructor, or user is a booking admin
  const isOwner = booking.memberId === req.user?.memberId
  const isAssignedInstructor =
    !!booking.instructorMemberId && booking.instructorMemberId === req.user?.memberId
  if (!isOwner && !isAssignedInstructor && !isBookingAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Booking not owned by user or user has no admin rights',
    })
  }
}

// Get a booking by ID
// Caution - KEEP THIS LASTin Get endpoints so that other paths are used first
router.get('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const { id } = req.params

  const booking = await getBookingById(id)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }
  validateWriteAccess(booking, req)

  res.status(200).json(booking)
})

const INSTRUCTOR_ROLES = ['INSTRUCTOR', 'EXAMINER']

const validateInstructor = async (
  type: BookingType,
  instructorMemberId: string | null | undefined,
) => {
  if (type !== BookingType.TRAINING) {
    return
  }
  if (!instructorMemberId) {
    return problem({ status: 400, detail: 'Instructor is required for training bookings' })
  }
  const roles = await getMemberRolesByMemberId(instructorMemberId)
  const hasInstructorRole = roles.some((role) => INSTRUCTOR_ROLES.includes(role.roleId))
  if (!hasInstructorRole) {
    return problem({
      status: 400,
      detail: 'Instructor must have INSTRUCTOR or EXAMINER role',
    })
  }
}

// insertBooking's return value doesn't carry the joined student name (only
// getBookingById-backed reads do), so callers pass it explicitly rather than
// this helper reading it off booking.member itself.
const memberFullName = (member: { firstName?: string; lastName?: string } | null | undefined) =>
  `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()

type InstructorNotificationKind = 'confirmed' | 'updated' | 'cancelled'

const sendInstructorNotification = async (
  instructorMemberId: string,
  booking: Booking,
  studentName: string,
  kind: InstructorNotificationKind,
): Promise<void> => {
  const instructor = await getMemberById(instructorMemberId)
  if (!instructor?.email) return

  if (kind === 'cancelled') {
    const { subject, html } = renderEmail(
      'booking-instructor-cancelled',
      instructor.lang,
      bookingEmailVars(booking, { firstName: instructor.firstName, studentName }),
    )
    await sendEmail(instructor.email, subject, html, [
      {
        filename: 'booking.ics',
        content: generateCancelIcsContent(booking),
        contentType: 'text/calendar',
      },
    ])
    return
  }

  const { subject, html } = renderEmail(
    kind === 'confirmed' ? 'booking-instructor-confirmed' : 'booking-instructor-updated',
    instructor.lang,
    bookingEmailVars(booking, { firstName: instructor.firstName, studentName }),
  )

  await sendEmail(instructor.email, subject, html, [
    {
      filename: 'booking.ics',
      content: generateIcsContent(booking, instructor.email),
      contentType: 'text/calendar',
    },
  ])
}

// Single entry point for every instructor notification across the route handlers below.
// Callers don't await this (delivery shouldn't block the response), so failures are
// caught and logged here instead of surfacing as an unhandled promise rejection, which
// would otherwise crash the whole process (Node has no unhandledRejection handler).
const notifyInstructor = (
  instructorMemberId: string | null | undefined,
  booking: Booking,
  studentName: string,
  kind: InstructorNotificationKind,
): void => {
  if (!instructorMemberId) return
  sendInstructorNotification(instructorMemberId, booking, studentName, kind).catch((error) => {
    logger.error(
      `Failed to send instructor ${kind} notification for booking ${booking.bookingId}: ${error}`,
    )
  })
}

const clearOverlappingBookings = async (
  booking: BookingUpsertRequest & { bookingId: string },
  jwt: JWTUser,
) => {
  const overlaps = await getBookings({
    registration: booking.registration,
    from: dayjs.unix(Number(booking.startTimeEpoch)).toISOString(),
    to: dayjs.unix(Number(booking.endTimeEpoch)).toISOString(),
    excludeBookingId: booking.bookingId,
    exclusiveStartEnd: true,
  })

  if (overlaps.length > 0 && !isBookingAdmin(jwt)) {
    return problem({
      status: 400,
      detail: 'Overlapping bookings',
    })
  }

  for (const overlap of overlaps) {
    console.log('Clearing overlapping booking', overlap)
    const cancelledOverlap = await updateBooking(
      overlap.bookingId,
      { status: BookingStatus.CANCELLED },
      jwt,
    )
    if (!cancelledOverlap) {
      continue
    }

    const member = await getMemberById(cancelledOverlap.memberId)
    if (member?.email) {
      const { subject, html } = renderEmail(
        'booking-cancelled',
        member.lang,
        bookingEmailVars(cancelledOverlap, { firstName: member.firstName }),
      )
      sendEmail(member.email, subject, html, [
        {
          filename: 'booking.ics',
          content: generateCancelIcsContent(cancelledOverlap),
          contentType: 'text/calendar',
        },
      ])
    }
    notifyInstructor(
      cancelledOverlap.instructorMemberId,
      cancelledOverlap,
      memberFullName(cancelledOverlap.member),
      'cancelled',
    )
  }
}

// Update a booking
router.patch('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const bookingId = req.params.id

  const patch = BookingUpsertSchema.partial().parse(req.body)

  const booking = await getBookingById(bookingId)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }
  validateWriteAccess(booking, req)

  const isAdmin = isBookingAdmin(req.user)
  if (!isAdmin) {
    if (patch.memberId && patch.memberId !== req.user!.memberId) {
      return problem({ status: 400, detail: 'Invalid member id' })
    }
    if (req.user?.canMakeReservations !== true) {
      return problem({ status: 400, detail: 'Reservations suspended' })
    }
  }

  // Validate instructor requirement: use patched type/instructor or fall back to existing booking values
  const effectiveType = patch.type ?? booking.type
  const effectiveInstructorMemberId =
    patch.instructorMemberId !== undefined ? patch.instructorMemberId : booking.instructorMemberId
  const instructorError = await validateInstructor(effectiveType, effectiveInstructorMemberId)
  if (instructorError) return instructorError

  await clearOverlappingBookings(
    {
      ...booking,
      ...patch,
      bookingId,
    },
    req.user!,
  )

  const updated = await updateBooking(bookingId, patch, req.user!)
  if (!updated) {
    return problem({
      status: 500,
      detail: 'Booking update failed',
    })
  }

  const member = await getMemberById(updated.memberId)
  if (member?.email) {
    const { subject, html } = renderEmail(
      'booking-updated',
      member.lang,
      bookingEmailVars(updated, { firstName: member.firstName }),
    )
    sendEmail(member.email, subject, html, [
      {
        filename: 'booking.ics',
        content: generateIcsContent(updated, member.email),
        contentType: 'text/calendar',
      },
    ])
  }

  // A generic PATCH can also cancel the booking (status is a patchable field), which
  // takes priority over an instructor reassignment: notify the pre-patch instructor
  // that their booking was cancelled, using the pre-patch snapshot for the schedule.
  const bookingJustCancelled =
    updated.status === BookingStatus.CANCELLED && booking.status !== BookingStatus.CANCELLED

  if (bookingJustCancelled) {
    notifyInstructor(
      booking.instructorMemberId,
      booking,
      memberFullName(booking.member),
      'cancelled',
    )
  } else if (booking.instructorMemberId !== updated.instructorMemberId) {
    notifyInstructor(
      booking.instructorMemberId,
      booking,
      memberFullName(booking.member),
      'cancelled',
    )
    notifyInstructor(
      updated.instructorMemberId,
      updated,
      memberFullName(updated.member),
      'confirmed',
    )
  } else {
    notifyInstructor(updated.instructorMemberId, updated, memberFullName(updated.member), 'updated')
  }

  res.status(200).json(updated)
})

// Cancel a booking with a reason
router.post('/:id/cancel', async (req: Request<Record<string, string>>, res: Response) => {
  const bookingId = req.params.id

  const cancellation = CancellationRequestSchema.parse(req.body)

  const booking = await getBookingById(bookingId)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }
  if (booking.status === BookingStatus.CANCELLED) {
    return problem({ status: 409, detail: 'Booking already cancelled' })
  }
  validateWriteAccess(booking, req)

  logger.info(
    `Cancelling booking ${bookingId}. Cancelled by member: ${req.user?.memberId} with permissions :${req.user?.permissions}`,
  )

  const cancelled = await cancelBooking(bookingId, req.user!, cancellation)
  if (!cancelled) {
    return problem({
      status: 500,
      detail: 'Booking cancellation failed',
    })
  }

  const member = await getMemberById(cancelled.memberId)
  if (member?.email) {
    const { subject, html } = renderEmail(
      'booking-cancelled',
      member.lang,
      bookingEmailVars(cancelled, { firstName: member.firstName }),
    )
    sendEmail(member.email, subject, html, [
      {
        filename: 'booking.ics',
        content: generateCancelIcsContent(cancelled),
        contentType: 'text/calendar',
      },
    ])
  }
  notifyInstructor(
    cancelled.instructorMemberId,
    cancelled,
    memberFullName(cancelled.member),
    'cancelled',
  )

  res.status(200).json(cancelled)
})

// Transfer a booking to another member
router.post('/:id/transfer', async (req: Request<Record<string, string>>, res: Response) => {
  const bookingId = req.params.id

  const { newMemberId } = TransferBookingSchema.parse(req.body)

  const booking = await getBookingById(bookingId)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }
  if (booking.status === BookingStatus.CANCELLED) {
    return problem({ status: 409, detail: 'Cannot transfer a cancelled booking' })
  }
  if (Number(booking.startTimeEpoch) <= dayjs().unix()) {
    return problem({ status: 409, detail: 'Cannot transfer a booking that has already started' })
  }

  const isOwner = booking.memberId === req.user?.memberId
  if (!isOwner && !isBookingAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Booking not owned by user or user has no admin rights',
    })
  }

  if (newMemberId === booking.memberId) {
    return problem({ status: 400, detail: 'Booking is already owned by this member' })
  }

  const newMember = await getMemberById(newMemberId)
  if (!newMember) {
    return problem({ status: 400, detail: 'Member not found' })
  }
  if (!isBookingAdmin(req.user) && newMember.canMakeReservations !== true) {
    return problem({ status: 400, detail: 'This member cannot currently make reservations' })
  }

  const previousMember = await getMemberById(booking.memberId)

  logger.info(
    `Transferring booking ${bookingId} from ${booking.memberId} to ${newMemberId}. Requested by: ${req.user?.memberId}`,
  )

  const updated = await updateBooking(bookingId, { memberId: newMemberId }, req.user!)
  if (!updated) {
    return problem({ status: 500, detail: 'Booking transfer failed' })
  }

  if (previousMember?.email) {
    const { subject, html } = renderEmail(
      'booking-transferred-from',
      previousMember.lang,
      bookingEmailVars(booking, {
        firstName: previousMember.firstName,
        newMemberName: `${newMember.firstName} ${newMember.lastName}`,
      }),
    )
    sendEmail(previousMember.email, subject, html)
  }

  if (newMember.email) {
    const { subject, html } = renderEmail(
      'booking-transferred-to',
      newMember.lang,
      bookingEmailVars(updated, {
        firstName: newMember.firstName,
        previousMemberName:
          `${previousMember?.firstName ?? ''} ${previousMember?.lastName ?? ''}`.trim(),
      }),
    )
    sendEmail(newMember.email, subject, html, [
      {
        filename: 'booking.ics',
        content: generateIcsContent(updated, newMember.email),
        contentType: 'text/calendar',
      },
    ])
  }

  notifyInstructor(updated.instructorMemberId, updated, memberFullName(updated.member), 'updated')

  res.status(200).json(updated)
})

export default router
