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
} from './models.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { type JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
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
import {
  bookingCancelledEmailBodyHtml,
  bookingCancelledEmailSubject,
} from '../../templates/bookingCancelledEmailTemplate.ts'
import {
  bookingConfirmedEmailBodyHtml,
  bookingConfirmedEmailSubject,
  bookingUpdatedEmailBodyHtml,
  bookingUpdatedEmailSubject,
} from '../../templates/bookingConfirmedEmailTemplate.ts'
import {
  bookingTransferredFromEmailBodyHtml,
  bookingTransferredFromEmailSubject,
  bookingTransferredToEmailBodyHtml,
  bookingTransferredToEmailSubject,
} from '../../templates/bookingTransferredEmailTemplate.ts'
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
    sendEmail(
      member.email,
      bookingConfirmedEmailSubject(member.lang),
      bookingConfirmedEmailBodyHtml(member.lang, member.firstName, booking),
      [
        {
          filename: 'booking.ics',
          content: generateIcsContent(booking, member.email),
          contentType: 'text/calendar',
        },
      ],
    )
  }

  res.status(201).json(booking)
})

// Get bookings
router.get('/', async (req: Request<BookingFilters>, res: Response<BookingListResponse>) => {
  const data = BookingFiltersSchema.parse(req.query)

  // If user is not Booking Admin they can only query their own bookings
  const filters: BookingFilters = {
    ...data,
    ...(isBookingAdmin(req.user) || !data.memberId ? {} : { memberId: req.user!.memberId }),
  }

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

// Get a booking by ID
// Caution - KEEP THIS LASTin Get endpoints so that other paths are used first
router.get('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const { id } = req.params

  const booking = await getBookingById(id)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }

  res.status(200).json(booking)
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
      sendEmail(
        member.email,
        bookingCancelledEmailSubject(member.lang),
        bookingCancelledEmailBodyHtml(member.lang, member.firstName, cancelledOverlap),
        [
          {
            filename: 'booking.ics',
            content: generateCancelIcsContent(cancelledOverlap),
            contentType: 'text/calendar',
          },
        ],
      )
    }
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
    sendEmail(
      member.email,
      bookingUpdatedEmailSubject(member.lang),
      bookingUpdatedEmailBodyHtml(member.lang, member.firstName, updated),
      [
        {
          filename: 'booking.ics',
          content: generateIcsContent(updated, member.email),
          contentType: 'text/calendar',
        },
      ],
    )
  }

  res.status(200).json(updated)
})

// Cancel a booking (legacy endpoint, no reason required)
router.delete('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const bookingId = req.params.id

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

  const cancelled = await cancelBooking(bookingId, req.user!)
  if (!cancelled) {
    return problem({
      status: 500,
      detail: 'Booking deletion failed',
    })
  }

  const member = await getMemberById(cancelled.memberId)
  if (member?.email) {
    sendEmail(
      member.email,
      bookingCancelledEmailSubject(member.lang),
      bookingCancelledEmailBodyHtml(member.lang, member.firstName, cancelled),
      [
        {
          filename: 'booking.ics',
          content: generateCancelIcsContent(cancelled),
          contentType: 'text/calendar',
        },
      ],
    )
  }

  res.status(204).json(cancelled)
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
    sendEmail(
      member.email,
      bookingCancelledEmailSubject(member.lang),
      bookingCancelledEmailBodyHtml(member.lang, member.firstName, cancelled),
      [
        {
          filename: 'booking.ics',
          content: generateCancelIcsContent(cancelled),
          contentType: 'text/calendar',
        },
      ],
    )
  }

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
    sendEmail(
      previousMember.email,
      bookingTransferredFromEmailSubject(previousMember.lang),
      bookingTransferredFromEmailBodyHtml(
        previousMember.lang,
        previousMember.firstName,
        booking,
        `${newMember.firstName} ${newMember.lastName}`,
      ),
    )
  }

  if (newMember.email) {
    sendEmail(
      newMember.email,
      bookingTransferredToEmailSubject(newMember.lang),
      bookingTransferredToEmailBodyHtml(
        newMember.lang,
        newMember.firstName,
        updated,
        `${previousMember?.firstName ?? ''} ${previousMember?.lastName ?? ''}`.trim(),
      ),
      [
        {
          filename: 'booking.ics',
          content: generateIcsContent(updated, newMember.email),
          contentType: 'text/calendar',
        },
      ],
    )
  }

  res.status(200).json(updated)
})

export default router
