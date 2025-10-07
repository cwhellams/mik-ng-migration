import { Router, type Request, type Response } from 'express'

import {
  BookingFiltersSchema,
  BookingStatus,
  BookingUpsertSchema,
  type Booking,
  type BookingFilters,
  type BookingListResponse,
  type BookingUpsertRequest,
} from './models.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
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
import { getMemberById } from '../../db/member-queries.ts'
import {
  bookingCancelledEmailBodyHtml,
  bookingCancelledEmailPlainText,
  bookingCancelledEmailSubject,
} from '../../templates/bookingCancelledEmailTemplate.ts'

// all scheduling routes are protected by booking permissions
const router = Router()
router.use(validateUser(MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN))

const isBookingAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.BOOKING_ADMIN) ?? false

// Create a booking
router.post('/', async (req: Request, res: Response) => {
  const data = BookingUpsertSchema.parse(req.body)

  // only admin can create bookings for other members
  const isAdmin = isBookingAdmin(req.user)
  if (!isAdmin && data.memberId !== req.user!.memberId) {
    return problem({ status: 400, detail: 'Invalid member id' })
  }

  await clearOverlappingBookings(
    {
      ...data,
      bookingId: '',
    },
    req.user!,
  )

  const booking = await insertBooking(data, req.user!)
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
        'registration[]': filters['registration[]'],
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
        'registration[]': filters['registration[]'],
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
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const booking = await getBookingById(id)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }

  res.status(200).json(booking)
})

const validateWriteAccess = (booking: Pick<Booking, 'memberId'>, req: Request) => {
  // Check if the booking is owned by the user or the user is not a booking admin
  if (booking.memberId !== req.user?.memberId && !isBookingAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Booking not owned by user or user has no admin rights',
    })
  }
}

const clearOverlappingBookings = async (
  booking: BookingUpsertRequest & { bookingId: string },
  jwt: JWTUser,
) => {
  const overlaps = await getBookings({
    'registration[]': booking.registration,
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

  const admin = await getMemberById(jwt.memberId)

  for (const overlap of overlaps) {
    console.log('Clearing overlapping booking', overlap)
    await updateBooking(overlap.bookingId, { status: BookingStatus.CANCELLED }, jwt)

    const member = await getMemberById(overlap.memberId)
    if (member?.email) {
      sendEmail(
        member.email,
        bookingCancelledEmailSubject(member.lang),
        bookingCancelledEmailBodyHtml(member.lang, admin!, overlap, booking),
        bookingCancelledEmailPlainText(member.lang, admin!, overlap, booking),
      )
    }
  }
}

// Update a booking
router.patch('/:id', async (req: Request, res: Response) => {
  const bookingId = req.params.id

  const patch = BookingUpsertSchema.partial().parse(req.body)

  const booking = await getBookingById(bookingId)
  if (!booking) {
    return problem({ status: 404, detail: 'Booking not found' })
  }
  validateWriteAccess(booking, req)

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

  res.status(200).json(updated)
})

// Cancel a booking
router.delete('/:id', async (req: Request, res: Response) => {
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

  res.status(204).json(cancelled)
})

export default router
