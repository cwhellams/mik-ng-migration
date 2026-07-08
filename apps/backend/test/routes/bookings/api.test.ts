import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import bookingsRouter from '../../../src/routes/bookings/api.ts'
import {
  BookingStatus,
  BookingType,
  CancellationReason,
} from '../../../src/routes/bookings/models.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type {
  Booking,
  BookingFilters,
  BookingUpsertRequest,
} from '../../../src/routes/bookings/models.ts'
import dayjs from 'dayjs'

const userId = 'Matti1'
const adminMemberId = 'Pekka1'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/bookings', bookingsRouter)
app.use(problemErrorHandler)

const userToken = generateAccessToken({
  memberId: userId,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.BOOKING_USER],
  canMakeReservations: true,
})

const adminToken = generateAccessToken({
  memberId: adminMemberId,
  lastName: 'Admin',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.BOOKING_ADMIN],
  canMakeReservations: true,
})

describe('GET /bookings', () => {
  it('should return all bookings for the logged in user', async () => {
    const response = await request(app)
      .get('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .query(<BookingFilters>{})

    expect(response.status).toBe(200)
    expect(response.body.bookings.length >= 40).toBe(true)
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .query(<BookingFilters>{
        from: dayjs().startOf('day').add(1, 'day').toISOString(),
        to: dayjs().startOf('day').add(2, 'day').toISOString(),
        registration: ['OH-IHQ'],
      })

    expect(response.status).toBe(200)
    expect(response.body.bookings).toHaveLength(1)
  })

  it('should return 400 for invalid date format', async () => {
    const response = await request(app)
      .get('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .query({
        from: '2025',
      })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/bookings',
      timestamp: expect.any(String),
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_format',
          format: 'datetime',
          path: ['from'],
        }),
      ]),
    })
  })
})

describe('GET /bookings/bookingId', () => {
  it('should return booking for the logged in user', async () => {
    const response = await request(app)
      .get('/bookings/stl1')
      .set('Cookie', `accessToken=${userToken}`)
      .query({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      bookingId: 'stl1',
      calendarSequence: expect.any(Number),
      cancelledBy: null,
      cancelledByName: undefined,
      createdAt: expect.any(String),
      createdBy: 'Liisa1',
      createdByName: 'Liisa Korhonen',
      endTime: expect.any(String),
      endTimeEpoch: expect.any(String),
      instructor: {
        firstName: expect.any(String),
        lastName: expect.any(String),
        phoneNumber: expect.any(String),
      },
      instructorMemberId: expect.any(String),
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
      updatedByName: 'Liisa Korhonen',
    })
  })

  it('should return 403 for the user without booking privileges', async () => {
    const noAccess = generateAccessToken({
      memberId: adminMemberId,
      lastName: 'NoAccess',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [],
      canMakeReservations: false,
    })

    const response = await request(app)
      .get('/bookings/efnu4evr')
      .set('Cookie', `accessToken=${noAccess}`)
      .query({})

    expect(response.status).toBe(403)
  })

  it('should return 404 for unknown flight', async () => {
    const response = await request(app)
      .get('/bookings/noup')
      .set('Cookie', `accessToken=${userToken}`)
      .query({})

    expect(response.status).toBe(404)
  })
})

describe('POST /bookings', () => {
  const startTime = dayjs().startOf('day')
  const payload: BookingUpsertRequest = {
    memberId: userId,
    registration: 'OH-IHQ',
    status: BookingStatus.CONFIRMED,
    type: BookingType.PRIVATE,
    description: 'API booking',
    startTimeEpoch: startTime.unix().toString(),
    endTimeEpoch: startTime.add(15, 'minutes').unix().toString(),
  }

  // Matti1 has INSTRUCTOR role in test data
  const trainingPayload: BookingUpsertRequest = {
    ...payload,
    type: BookingType.TRAINING,
    instructorMemberId: userId, // Matti1 has INSTRUCTOR role
  }

  it('should create a booking with valid payload, return booking_id and be deleted using the returned id', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(payload)

    expect(response.body.bookingId).toBeDefined()
    const id = response.body.bookingId
    expect(id).toHaveLength(9)
    expect(response.status).toBe(201)

    const checkPost = await request(app)
      .get(`/bookings/${id}`)
      .set('Cookie', `accessToken=${userToken}`)
    expect(checkPost.status).toBe(200)

    const checkPostBody = checkPost.body as Booking
    expect(checkPostBody.createdBy).toBe(userId)
    expect(checkPostBody.updatedBy).toBe(userId)
    expect(checkPostBody.memberId).toBe(userId)

    // Cleanup
    const delResponse = await request(app)
      .delete(`/bookings/${id}`)
      .set('Cookie', `accessToken=${userToken}`)
      .set('Accept', 'application/json')
    expect(delResponse.status).toBe(204)
    expect(delResponse.body).toEqual({})
  })

  it('should create a new booking over cancelled booking with the same times', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(payload)

    expect(response.body.bookingId).toBeDefined()
    const id = response.body.bookingId
    expect(id).toHaveLength(9)
    expect(response.status).toBe(201)

    const duplicate = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(payload)

    expect(duplicate.body).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: 'Overlapping bookings',
      instance: '/bookings',
      timestamp: expect.any(String),
    })

    // Cleanup
    const delResponse = await request(app)
      .delete(`/bookings/${id}`)
      .set('Cookie', `accessToken=${userToken}`)
      .set('Accept', 'application/json')
    expect(delResponse.status).toBe(204)
    expect(delResponse.body).toEqual({})
  })

  it('should allow admins to overwrite existing bookings', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(payload)

    expect(response.body.bookingId).toBeDefined()
    const id = response.body.bookingId
    expect(id).toHaveLength(9)
    expect(response.status).toBe(201)

    const overwrite = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ ...payload, memberId: adminMemberId })
      .set('x-sudo', 'true')
    expect(overwrite.status).toBe(201)
    expect(overwrite.body.status).toEqual(BookingStatus.CONFIRMED)

    const checkOriginal = await request(app)
      .get(`/bookings/${id}`)
      .set('Cookie', `accessToken=${userToken}`)
    expect(checkOriginal.status).toBe(200)
    expect(checkOriginal.body.status).toEqual(BookingStatus.CANCELLED)

    // Cleanup
    const delAgainResponse = await request(app)
      .delete(`/bookings/${id}`)
      .set('Cookie', `accessToken=${userToken}`)
      .set('Accept', 'application/json')
    expect(delAgainResponse.status).toBe(409)
    expect(delAgainResponse.body).toEqual({
      status: 409,
      title: 'Conflict',
      detail: 'Booking already cancelled',
      instance: `/bookings/${id}`,
      timestamp: expect.any(String),
    })

    const delWrongUserResponse = await request(app)
      .delete(`/bookings/${overwrite.body.bookingId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .set('Accept', 'application/json')
    expect(delWrongUserResponse.status).toBe(403)
    expect(delWrongUserResponse.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Booking not owned by user or user has no admin rights',
      instance: `/bookings/${overwrite.body.bookingId}`,
      timestamp: expect.any(String),
    })

    const delAdminResponse = await request(app)
      .delete(`/bookings/${overwrite.body.bookingId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .set('Accept', 'application/json')
    expect(delAdminResponse.status).toBe(204)
    expect(delAdminResponse.body).toEqual({})
  })

  it('should return 400 for invalid payload', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ ...payload, registration: undefined })

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(
      response.body.errors.some((e: { message: string }) => /received undefined/.test(e.message)),
    ).toBe(true)
  })

  it('should return 400 when creating TRAINING booking without instructor', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ ...payload, type: BookingType.TRAINING })

    expect(response.status).toBe(400)
    expect(response.body.detail).toEqual('Instructor is required for training bookings')
  })

  it('should return 400 when creating TRAINING booking with non-instructor member', async () => {
    // Pekka1 (adminMemberId) does not have INSTRUCTOR or EXAMINER role
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ ...payload, type: BookingType.TRAINING, instructorMemberId: 'Pekka1' })

    expect(response.status).toBe(400)
    expect(response.body.detail).toEqual('Instructor must have INSTRUCTOR or EXAMINER role')
  })

  it('should create a TRAINING booking with a valid instructor', async () => {
    const response = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(trainingPayload)

    expect(response.status).toBe(201)
    expect(response.body.bookingId).toBeDefined()
    expect(response.body.instructorMemberId).toBe(userId)

    // Cleanup
    const delResponse = await request(app)
      .delete(`/bookings/${response.body.bookingId}`)
      .set('Cookie', `accessToken=${userToken}`)
    expect(delResponse.status).toBe(204)
  })

  it('should allow assigned instructor to delete their training booking', async () => {
    // Admin creates a booking where Antti1 is the member and userId (Matti1) is the instructor
    const adminCreateResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ ...trainingPayload, memberId: 'Antti1', instructorMemberId: userId })

    expect(adminCreateResponse.status).toBe(201)
    const bookingId = adminCreateResponse.body.bookingId

    // userId (Matti1) is the assigned instructor and should be able to delete
    const delResponse = await request(app)
      .delete(`/bookings/${bookingId}`)
      .set('Cookie', `accessToken=${userToken}`)
    expect(delResponse.status).toBe(204)
  })
})

describe('PATCH /bookings/', () => {
  it('should update booking when billable member matches token member or user has elevated role', async () => {
    const payload: Partial<BookingUpsertRequest> = {
      memberId: 'Antti1',
    }

    const patchResponse = await request(app)
      .patch('/bookings/stl3')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    const checkPatch = await request(app)
      .get('/bookings/stl3')
      .set('Cookie', `accessToken=${adminToken}`)

    // patch returns the same as another get
    expect(patchResponse.status).toBe(200)
    expect(patchResponse.body).toEqual(checkPatch.body)

    expect(checkPatch.status).toBe(200)
    expect(checkPatch.body.memberId).toBe('Antti1')

    const undoPayload: Partial<BookingUpsertRequest> = {
      memberId: 'Matti1',
    }
    const undoResponse = await request(app)
      .patch('/bookings/stl3')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(undoPayload)

    const checkUndo = await request(app)
      .get('/bookings/stl3')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(undoResponse.status).toBe(200)
    expect(undoResponse.body).toEqual(checkUndo.body)

    expect(checkUndo.status).toBe(200)
    expect(checkUndo.body.memberId).toBe('Matti1')
  })

  it('should not assign booking to another member without admin priviledges', async () => {
    const payload: Partial<BookingUpsertRequest> = {
      memberId: 'Antti1',
    }

    const patchResponse = await request(app)
      .patch('/bookings/stl3')
      .set('Cookie', `accessToken=${userToken}`)
      .send(payload)

    expect(patchResponse.status).toBe(400)
    expect(patchResponse.body.detail).toEqual('Invalid member id')
  })

  it('should return a 401 if an invalid JWT token is passed', async () => {
    const payload: Partial<Booking> = {
      memberId: 'Liisa1',
    }

    const invalidToken = 'THIS WILL NOT WORK'

    const response = await request(app)
      .patch('/bookings/efnu4evr')
      .set('Cookie', `accessToken=${invalidToken}`)
      .send(payload)

    expect(response.status).toBe(401)
  })
  it('should return a 403 if the member id does not match token ID for a USER', async () => {
    const payload: Partial<Booking> = {
      memberId: 'OtherUser',
    }

    const invalidToken = generateAccessToken({
      memberId: 'OtherUser',
      lastName: 'Test',
      email: 'test@mik.fi',
      roles: [],
      permissions: [MIKPermissions.BOOKING_USER],
      canMakeReservations: true,
    })

    const response = await request(app)
      .patch('/bookings/stl2')
      .set('Cookie', `accessToken=${invalidToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Booking not owned by user or user has no admin rights',
      instance: '/bookings/stl2',
      timestamp: expect.any(String),
    })
  })
  it('should return a 500 if trying to patch time components to be invalid', async () => {
    const payload: Partial<BookingUpsertRequest> = {
      endTimeEpoch: '0',
    }

    const response = await request(app)
      .patch('/bookings/stl1')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail:
        'new row for relation \"bookings\" violates check constraint \"check_booking_time_sequence\"',
      instance: '/bookings/stl1',
      timestamp: expect.any(String),
    })
  })
})

describe('POST /bookings/:id/cancel', () => {
  const startTime = dayjs().startOf('day').add(3, 'day')
  const createPayload: BookingUpsertRequest = {
    memberId: userId,
    registration: 'OH-IHQ',
    status: BookingStatus.CONFIRMED,
    type: BookingType.PRIVATE,
    description: 'Cancel test booking',
    startTimeEpoch: startTime.unix().toString(),
    endTimeEpoch: startTime.add(30, 'minutes').unix().toString(),
  }

  it('should cancel a booking with a reason and return 200 with the updated booking', async () => {
    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(createPayload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId

    const cancelResponse = await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.PERSONAL_CONFLICT })

    expect(cancelResponse.status).toBe(200)
    expect(cancelResponse.body.status).toBe(BookingStatus.CANCELLED)
    expect(cancelResponse.body.cancellationReason).toBe(CancellationReason.PERSONAL_CONFLICT)
    expect(cancelResponse.body.cancellationNote).toBeFalsy()
    expect(cancelResponse.body.cancelledBy).toBe(userId)
    expect(cancelResponse.body.cancelledAt).toBeDefined()
  })

  it('should cancel a booking with a reason and optional note', async () => {
    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(createPayload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId

    const cancelResponse = await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.WEATHER_DEPARTURE, note: 'Low visibility at EFHK' })

    expect(cancelResponse.status).toBe(200)
    expect(cancelResponse.body.status).toBe(BookingStatus.CANCELLED)
    expect(cancelResponse.body.cancellationReason).toBe(CancellationReason.WEATHER_DEPARTURE)
    expect(cancelResponse.body.cancellationNote).toBe('Low visibility at EFHK')
  })

  it('should return 400 for an invalid cancellation reason', async () => {
    const cancelResponse = await request(app)
      .post('/bookings/stl2/cancel')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: 'NOT_A_VALID_REASON' })

    expect(cancelResponse.status).toBe(400)
    expect(cancelResponse.body.errors).toBeDefined()
  })

  it('should return 400 when reason is missing from request body', async () => {
    const cancelResponse = await request(app)
      .post('/bookings/stl2/cancel')
      .set('Cookie', `accessToken=${userToken}`)
      .send({})

    expect(cancelResponse.status).toBe(400)
    expect(cancelResponse.body.errors).toBeDefined()
  })

  it('should return 404 when booking does not exist', async () => {
    const cancelResponse = await request(app)
      .post('/bookings/does-not-exist/cancel')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.OTHER })

    expect(cancelResponse.status).toBe(404)
    expect(cancelResponse.body.detail).toBe('Booking not found')
  })

  it('should return 409 when booking is already cancelled', async () => {
    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(createPayload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId

    await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.OTHER })

    const secondCancel = await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.OTHER })

    expect(secondCancel.status).toBe(409)
    expect(secondCancel.body.detail).toBe('Booking already cancelled')
  })

  it('should return 403 when user does not own the booking', async () => {
    const otherUserToken = generateAccessToken({
      memberId: 'Kaisa1',
      lastName: 'Laine',
      email: 'kaisa@mik.fi',
      roles: [],
      permissions: [MIKPermissions.BOOKING_USER],
      canMakeReservations: true,
    })

    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(createPayload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId

    const cancelResponse = await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${otherUserToken}`)
      .send({ reason: CancellationReason.PERSONAL_CONFLICT })

    expect(cancelResponse.status).toBe(403)
    expect(cancelResponse.body.detail).toBe('Booking not owned by user or user has no admin rights')

    // Cleanup: cancel as the owner so the slot is free for subsequent tests
    await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ reason: CancellationReason.PERSONAL_CONFLICT })
  })

  it('should allow an admin to cancel another members booking', async () => {
    const createResponse = await request(app)
      .post('/bookings')
      .set('Cookie', `accessToken=${userToken}`)
      .send(createPayload)
    expect(createResponse.status).toBe(201)
    const bookingId = createResponse.body.bookingId

    const cancelResponse = await request(app)
      .post(`/bookings/${bookingId}/cancel`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ reason: CancellationReason.AIRCRAFT_TECHNICAL })

    expect(cancelResponse.status).toBe(200)
    expect(cancelResponse.body.status).toBe(BookingStatus.CANCELLED)
    expect(cancelResponse.body.cancelledBy).toBe(adminMemberId)
  })

  it('should return 401 when called without a valid token', async () => {
    const cancelResponse = await request(app)
      .post('/bookings/stl2/cancel')
      .send({ reason: CancellationReason.OTHER })

    expect(cancelResponse.status).toBe(401)
  })
})
