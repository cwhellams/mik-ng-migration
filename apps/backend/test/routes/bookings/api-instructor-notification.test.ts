/**
 * Tests for instructor email notifications on booking create/update/cancel/transfer.
 *
 * This test is in a separate file because it requires jest.unstable_mockModule
 * (the ESM-native mock API) to intercept sendEmail before any modules that
 * depend on it are imported. All dependent imports therefore use dynamic
 * import() so that the mock is in place when they resolve. See
 * api-member-notification.test.ts for the same pattern.
 */

import { jest, describe, it, beforeEach, expect } from '@jest/globals'

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

// Deletes a booking and drains any fire-and-forget instructor notification it
// triggers, so a lingering async call can't land during the *next* test (after
// its beforeEach clears the mock) and pollute that test's assertions.
const cleanupBooking = async (bookingId: string) => {
  await request(app).delete(`/bookings/${bookingId}`).set('Cookie', `accessToken=${adminToken}`)
  await new Promise((resolve) => setTimeout(resolve, 300))
}

describe('Booking instructor notifications', () => {
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
      description: 'instructor notification test - create',
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
      description: 'instructor notification test - update',
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
      description: 'instructor notification test - instructor change',
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
      description: 'instructor notification test - cancel',
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId
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
      description: 'instructor notification test - transfer',
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
      description: 'instructor notification test - instructor + time change',
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
      description: 'instructor notification test - cancel via generic patch',
      startTimeEpoch: start.unix().toString(),
      endTimeEpoch: start.add(30, 'minutes').unix().toString(),
      instructorMemberId: 'Matti1',
    }

    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId
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
      description: 'instructor notification test - send failure is swallowed',
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
      description: 'instructor notification test - no instructor',
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
