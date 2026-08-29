/**
 * Tests for instructor email notifications on booking create/update/cancel/transfer.
 *
 * This test is in a separate file because it requires jest.unstable_mockModule
 * (the ESM-native mock API) to intercept sendEmail before any modules that
 * depend on it are imported. All dependent imports therefore use dynamic
 * import() so that the mock is in place when they resolve. See
 * api-member-notification.test.ts for the same pattern.
 */

import { jest, describe, it, beforeAll, beforeEach, afterAll, expect } from '@jest/globals'

// dotenv must load before any module that reads env vars
import 'dotenv/config'

import type { sendEmail } from '../../../src/lib/sendGmail.ts'

// Register the mock BEFORE importing any module that uses sendGmail.ts
const mockSendEmail = jest.fn<typeof sendEmail>()
jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

// Dynamic imports – all modules that (transitively) depend on sendGmail.ts
// must be imported here so they see the mock rather than the real module.
const { default: express } = await import('express')
const { default: cookieParser } = await import('cookie-parser')
const { default: request } = await import('supertest')

const { default: bookingsRouter } = await import('../../../src/routes/bookings/api.ts')
const { generateAccessToken } = await import('../../../src/routes/auth/token.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { MIKPermissions } = await import('@mik/contracts/members')
const { BookingStatus, BookingType } = await import('@mik/contracts/bookings')
const { getMemberById } = await import('../../../src/db/member-queries.ts')
const { db } = await import('../../../src/db/connection.ts')
const { emailTemplates } = await import('../../../src/templates/registry.ts')
const { normaliseEmailLang } = await import('../../../src/templates/renderEmail.ts')

// The subjects now live in the template registry; look them up the same way
// renderEmail() does so the assertions stay tied to the real strings.
const subjectFor = (key: 'confirmed' | 'updated' | 'cancelled', lang: string | undefined) =>
  emailTemplates[`booking-instructor-${key}`].subject[normaliseEmailLang(lang)]
const bookingInstructorConfirmedEmailSubject = (lang: string | undefined) =>
  subjectFor('confirmed', lang)
const bookingInstructorUpdatedEmailSubject = (lang: string | undefined) =>
  subjectFor('updated', lang)
const bookingInstructorCancelledEmailSubject = (lang: string | undefined) =>
  subjectFor('cancelled', lang)
import type { BookingUpsertRequest } from '@mik/contracts/bookings'
import dayjs from 'dayjs'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/bookings', bookingsRouter)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'Pekka1',
  lastName: 'Admin',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.BOOKING_ADMIN],
  canMakeReservations: true,
})

// Wait for the fire-and-forget instructor notification (DB lookup + sendEmail)
// to complete, since it is not awaited by the route handler before it responds.
const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const callsTo = (email: string) => mockSendEmail.mock.calls.filter((args) => args[0] === email)

// Mirrors formatIcsDate in @mik/contracts/calendar, to assert which schedule
// a generated .ics attachment describes without depending on dayjs plugins.
const icsDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

// Every booking this suite creates carries this description prefix, so a sweep
// can find the suite's rows even when a test failed before it captured an id.
const testDescriptionPrefix = 'instructor notification test'
const bookingDescription = (name: string) => `${testDescriptionPrefix} - ${name}`

// Removes every booking this suite has ever left behind, in this run or an
// earlier one.
const sweepSuiteBookings = () =>
  db
    .deleteFrom('schedule.bookings')
    .where('description', 'like', `${testDescriptionPrefix}%`)
    .execute()

// Drains any fire-and-forget instructor notification the booking triggered, so
// a lingering async call can't land during the *next* test (after its
// beforeEach clears the mock) and pollute that test's assertions, then deletes
// the booking.
//
// The delete goes straight to the database, as it does in every other suite
// that creates bookings. It used to be `DELETE /bookings/:id` — a route the
// bookings router has never had — which answered 404 into an ignored promise,
// so each run leaked nine CONFIRMED, future-dated OH-IHQ bookings and the next
// run's overlapping create auto-cancelled them, mailing the instructor a
// cancellation where the assertion wanted an assignment (#1306). Cleanup that
// ignores its own result cannot fail loudly, hence the throw below.
const cleanupBooking = async (bookingId: string) => {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const { numDeletedRows } = await db
    .deleteFrom('schedule.bookings')
    .where('bookingId', '=', bookingId)
    .executeTakeFirst()
  if (numDeletedRows !== 1n) {
    throw new Error(
      `Cleanup failed to delete booking ${bookingId}: deleted ${numDeletedRows} rows, expected 1`,
    )
  }
}

describe('Booking instructor notifications', () => {
  // Clear out anything an earlier run left behind before booking the same
  // aircraft again. A leftover CONFIRMED booking here is not inert: creating an
  // overlapping one as a booking admin auto-cancels it and mails its instructor,
  // which is exactly how the leak in #1306 surfaced as a failing assertion.
  beforeAll(async () => {
    await sweepSuiteBookings()
  })

  // Belt and braces for the per-test cleanup: a test that fails before it can
  // capture its booking id still leaves a row, and it must not reach the next
  // run. This suite's rows are all it touches.
  afterAll(async () => {
    await sweepSuiteBookings()
  })

  beforeEach(() => {
    mockSendEmail.mockClear()
  })

  it('emails the instructor with a calendar invite when assigned on a new training booking', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(200, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('create'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const response = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(response.status).toBe(201)
      bookingId = response.body.bookingId

      await waitFor(() => callsTo(instructor.email!).length > 0)

      const [, subject, body, attachments] = callsTo(instructor.email!)[0]
      expect(subject).toEqual(bookingInstructorConfirmedEmailSubject(instructor.lang))
      expect(body).toContain('Antti')
      expect(attachments![0].content).toContain('METHOD:REQUEST')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('emails the instructor an update when the booking time changes', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(201, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('update'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      // wait for the create's own fire-and-forget instructor email before clearing,
      // otherwise it can land after the clear and pollute the update assertion below
      await waitFor(() => callsTo(instructor.email!).length > 0)
      mockSendEmail.mockClear()

      const newStart = start.add(1, 'hour')
      const patchResponse = await request(app)
        .patch(`/bookings/${bookingId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({
          startTimeEpoch: newStart.unix().toString(),
          endTimeEpoch: newStart.add(30, 'minutes').unix().toString(),
        })
      expect(patchResponse.status).toBe(200)

      await waitFor(() => callsTo(instructor.email!).length > 0)

      const [, subject, , attachments] = callsTo(instructor.email!)[0]
      expect(subject).toEqual(bookingInstructorUpdatedEmailSubject(instructor.lang))
      expect(attachments![0].content).toContain('METHOD:REQUEST')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('notifies both the outgoing and incoming instructor when the instructor is changed', async () => {
    const previousInstructor = await getMemberById('Matti1')
    const newInstructor = await getMemberById('Jukka1')
    if (!previousInstructor?.email || !newInstructor?.email) {
      throw new Error('Test fixtures Matti1/Jukka1 have no email')
    }

    const start = dayjs().add(202, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('instructor change'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      await waitFor(() => callsTo(previousInstructor.email!).length > 0)
      mockSendEmail.mockClear()

      const patchResponse = await request(app)
        .patch(`/bookings/${bookingId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ instructorMemberId: 'Jukka1' })
      expect(patchResponse.status).toBe(200)

      await waitFor(
        () =>
          callsTo(previousInstructor.email!).length > 0 && callsTo(newInstructor.email!).length > 0,
      )

      const [, cancelledSubject, , cancelledAttachments] = callsTo(previousInstructor.email!)[0]
      expect(cancelledSubject).toEqual(
        bookingInstructorCancelledEmailSubject(previousInstructor.lang),
      )
      expect(cancelledAttachments![0].content).toContain('METHOD:CANCEL')

      const [, confirmedSubject, , confirmedAttachments] = callsTo(newInstructor.email!)[0]
      expect(confirmedSubject).toEqual(bookingInstructorConfirmedEmailSubject(newInstructor.lang))
      expect(confirmedAttachments![0].content).toContain('METHOD:REQUEST')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('emails the instructor a cancellation notice when the booking is cancelled', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(203, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('cancel'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    // Cancelling leaves the row behind — a cancelled booking is still a row on
    // OH-IHQ 203 days out — so this test cleans up like the others do.
    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      await waitFor(() => callsTo(instructor.email!).length > 0)
      mockSendEmail.mockClear()

      const cancelResponse = await request(app)
        .post(`/bookings/${bookingId}/cancel`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ reason: 'OTHER', note: 'test cleanup' })
      expect(cancelResponse.status).toBe(200)

      await waitFor(() => callsTo(instructor.email!).length > 0)

      const [, subject, , attachments] = callsTo(instructor.email!)[0]
      expect(subject).toEqual(bookingInstructorCancelledEmailSubject(instructor.lang))
      expect(attachments![0].content).toContain('METHOD:CANCEL')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('emails the instructor an update naming the new student when a booking is transferred', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(204, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('transfer'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      await waitFor(() => callsTo(instructor.email!).length > 0)
      mockSendEmail.mockClear()

      const transferResponse = await request(app)
        .post(`/bookings/${bookingId}/transfer`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ newMemberId: 'Sanna1' })
      expect(transferResponse.status).toBe(200)

      await waitFor(() => callsTo(instructor.email!).length > 0)

      const [, subject, body, attachments] = callsTo(instructor.email!)[0]
      expect(subject).toEqual(bookingInstructorUpdatedEmailSubject(instructor.lang))
      expect(body).toContain('Sanna')
      expect(attachments![0].content).toContain('METHOD:REQUEST')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('emails the outgoing instructor a cancellation notice using the pre-patch schedule when the instructor and time change together', async () => {
    const previousInstructor = await getMemberById('Matti1')
    const newInstructor = await getMemberById('Jukka1')
    if (!previousInstructor?.email || !newInstructor?.email) {
      throw new Error('Test fixtures Matti1/Jukka1 have no email')
    }

    const start = dayjs().add(206, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('instructor + time change'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      await waitFor(() => callsTo(previousInstructor.email!).length > 0)
      mockSendEmail.mockClear()

      const newStart = start.add(1, 'hour')
      const patchResponse = await request(app)
        .patch(`/bookings/${bookingId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({
          instructorMemberId: 'Jukka1',
          startTimeEpoch: newStart.unix().toString(),
          endTimeEpoch: newStart.add(30, 'minutes').unix().toString(),
        })
      expect(patchResponse.status).toBe(200)

      await waitFor(
        () =>
          callsTo(previousInstructor.email!).length > 0 && callsTo(newInstructor.email!).length > 0,
      )

      // The outgoing instructor's cancellation ICS must describe the flight they
      // were actually removed from (the original time), not the newly patched one.
      const [, , , cancelledAttachments] = callsTo(previousInstructor.email!)[0]
      expect(cancelledAttachments![0].content).toContain(icsDate(start.unix()))
      expect(cancelledAttachments![0].content).not.toContain(icsDate(newStart.unix()))

      const [, , , confirmedAttachments] = callsTo(newInstructor.email!)[0]
      expect(confirmedAttachments![0].content).toContain(icsDate(newStart.unix()))
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('emails the instructor a cancellation notice, not an update, when the booking is cancelled via a generic PATCH', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(207, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('cancel via generic patch'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    let bookingId: string | undefined
    try {
      const createResponse = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(createResponse.status).toBe(201)
      bookingId = createResponse.body.bookingId
      await waitFor(() => callsTo(instructor.email!).length > 0)
      mockSendEmail.mockClear()

      const patchResponse = await request(app)
        .patch(`/bookings/${bookingId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ status: BookingStatus.CANCELLED })
      expect(patchResponse.status).toBe(200)

      await waitFor(() => callsTo(instructor.email!).length > 0)

      const [, subject, , attachments] = callsTo(instructor.email!)[0]
      expect(subject).toEqual(bookingInstructorCancelledEmailSubject(instructor.lang))
      expect(attachments![0].content).toContain('METHOD:CANCEL')
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('does not crash the request when the instructor notification fails to send', async () => {
    const instructor = await getMemberById('Matti1')
    if (!instructor?.email) throw new Error('Test fixture Matti1 has no email')

    const start = dayjs().add(208, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.TRAINING,
      description: bookingDescription('send failure is swallowed'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    // Only the instructor notification should fail - the student confirmation
    // email (a separate, pre-existing fire-and-forget call) must still succeed.
    mockSendEmail.mockImplementation(async (to) => {
      if (to === instructor.email) {
        throw new Error('SMTP outage')
      }
    })

    let bookingId: string | undefined
    try {
      const response = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      // The response must succeed even though the fire-and-forget instructor
      // email rejects - a delivery failure must never surface as an unhandled
      // rejection that could crash the process.
      expect(response.status).toBe(201)
      bookingId = response.body.bookingId

      await waitFor(() => callsTo(instructor.email!).length > 0)
    } finally {
      mockSendEmail.mockReset()
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })

  it('does not email an instructor for bookings with no instructor assigned', async () => {
    const start = dayjs().add(205, 'days').startOf('minute')
    const payload: BookingUpsertRequest = {
      memberId: 'Antti1',
      registration: 'OH-IHQ',
      status: BookingStatus.CONFIRMED,
      type: BookingType.PRIVATE,
      description: bookingDescription('no instructor'),
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
    }

    let bookingId: string | undefined
    try {
      const response = await request(app)
        .post('/bookings')
        .set('Cookie', `accessToken=${adminToken}`)
        .send(payload)
      expect(response.status).toBe(201)
      bookingId = response.body.bookingId

      // give the fire-and-forget student email (and any accidental instructor
      // email) a moment to fire, then confirm only the student was emailed
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(mockSendEmail.mock.calls).toHaveLength(1)
    } finally {
      if (bookingId) {
        await cleanupBooking(bookingId)
      }
    }
  })
})
