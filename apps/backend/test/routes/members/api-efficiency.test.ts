import 'dotenv/config'
import { BookingStatus, BookingType, CancellationReason } from '@mik/contracts/bookings'
import type {
  MemberEfficiencyEntry,
  MemberEfficiencyResponse,
} from '@mik/contracts/member-efficiency'
import { MIKPermissions } from '@mik/contracts/members'
import { HttpStatusCode } from 'axios'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/members/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/members', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.MEMBER_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: ['MEMBER'],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Korhonen',
  email: 'no-permissions@mik.fi',
  roles: ['MEMBER'],
  permissions: [],
  canMakeReservations: false,
})

const MINUTE = 60

/**
 * June 2018 — far enough from the seeded data that this suite owns every booking and
 * flight in the window, so the club average it asserts on is arithmetic rather than a
 * snapshot of whatever the test database happens to hold. Seeded bookings are all
 * `current_date`-relative or dated later still, and no seeded flight log falls in 2018.
 *
 * Everything is on OH-STL for the same reason. A flight log may not be back-dated behind
 * an already-verified log on the same aircraft (`flight.no_overlaps_function` raises
 * "Protected time period"), and OH-STL is the one aircraft in the seed whose verified
 * logs all predate this window. Nor may a log be in the future, so 2035 is not an option
 * either — `check_epochs_not_future`.
 */
const WINDOW_FROM = '2018-06-01T00:00:00.000Z'
const WINDOW_TO = '2018-06-30T23:59:59.000Z'

const at = (day: number, hour: number): number =>
  Math.floor(Date.UTC(2018, 5, day, hour, 0, 0) / 1000)

const BOOKING_IDS = ['effTidy', 'effLate', 'effCanc', 'effNoFly', 'effOther', 'effPrev']
const FLIGHT_IDS = ['efFTidy', 'efFLate', 'efFOther', 'efFPrev']

const insertBookingRow = async (values: {
  bookingId: string
  memberId: string
  registration: string
  startTimeEpoch: number
  endTimeEpoch: number
  bookingStatus?: BookingStatus
  cancelledAt?: Date
  cancellationReason?: CancellationReason
  cancellationNote?: string
}) =>
  db
    .insertInto('schedule.bookings')
    .values({
      bookingId: values.bookingId,
      memberId: values.memberId,
      registration: values.registration,
      bookingType: BookingType.PRIVATE,
      bookingStatus: values.bookingStatus ?? BookingStatus.CONFIRMED,
      startTimeEpoch: values.startTimeEpoch,
      endTimeEpoch: values.endTimeEpoch,
      cancelledAt: values.cancelledAt ?? null,
      cancelledBy: values.cancelledAt ? 'k1mnimda' : null,
      cancellationReason: values.cancellationReason ?? null,
      cancellationNote: values.cancellationNote ?? null,
      createdBy: values.memberId,
      updatedBy: values.memberId,
    })
    .execute()

const insertFlightRow = async (values: {
  flightId: string
  memberId: string
  registration: string
  ajlbSeqNo: number
  offBlockTimeEpoch: number
  takeoffTimeEpoch: number
  landingTimeEpoch: number
  onBlockTimeEpoch: number
}) =>
  db
    .insertInto('flight.logs')
    .values({
      flightId: values.flightId,
      billableMemberId: values.memberId,
      picMemberId: values.memberId,
      picLastName: 'Tester',
      picRole: 'PIC' as const,
      aircraftRegistration: values.registration,
      offBlockTimeEpoch: values.offBlockTimeEpoch,
      takeoffTimeEpoch: values.takeoffTimeEpoch,
      landingTimeEpoch: values.landingTimeEpoch,
      onBlockTimeEpoch: values.onBlockTimeEpoch,
      fuelRemainingLitres: 40,
      personsOnBoard: 1,
      numberOfLandings: 1,
      nightFlyingMins: 0,
      instrumentFlyingMins: 0,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFHK',
      flightType: 'PRIVATE',
      createdBy: values.memberId,
      updatedBy: values.memberId,
      isBillableFlight: true,
      privOrComFlight: 'P',
      ajlbSeqNo: values.ajlbSeqNo,
      ajlbBlankRowsBefore: 0,
      status: 'NEW',
      isDtoTrainingFlight: false,
    })
    .execute()

const queryEfficiency = async (
  token: string,
  memberId = 'Matti1',
  query: Record<string, string> = { from: WINDOW_FROM, to: WINDOW_TO },
) =>
  request(app)
    .get(`/members/${memberId}/reservation-efficiency`)
    .set('Cookie', `accessToken=${token}`)
    .query(query)

const entryFor = (body: MemberEfficiencyResponse, bookingId: string): MemberEfficiencyEntry => {
  const entry = body.entries.find((candidate) => candidate.bookingId === bookingId)
  if (!entry) throw new Error(`No entry for ${bookingId}`)
  return entry
}

describe('GET /members/:memberId/reservation-efficiency', () => {
  beforeAll(async () => {
    // Flown promptly, handed back promptly: 3h reserved, 2h30 airborne.
    await insertBookingRow({
      bookingId: 'effTidy',
      memberId: 'Matti1',
      registration: 'OH-STL',
      startTimeEpoch: at(5, 9),
      endTimeEpoch: at(5, 12),
    })
    await insertFlightRow({
      flightId: 'efFTidy',
      memberId: 'Matti1',
      registration: 'OH-STL',
      ajlbSeqNo: 1,
      offBlockTimeEpoch: at(5, 9) + 10 * MINUTE,
      takeoffTimeEpoch: at(5, 9) + 15 * MINUTE,
      landingTimeEpoch: at(5, 11) + 45 * MINUTE,
      onBlockTimeEpoch: at(5, 11) + 50 * MINUTE,
    })

    // Same aircraft held from 09:00 but not moved until 10:00 — an hour of head gap.
    await insertBookingRow({
      bookingId: 'effLate',
      memberId: 'Matti1',
      registration: 'OH-STL',
      startTimeEpoch: at(6, 9),
      endTimeEpoch: at(6, 13),
    })
    await insertFlightRow({
      flightId: 'efFLate',
      memberId: 'Matti1',
      registration: 'OH-STL',
      ajlbSeqNo: 1,
      offBlockTimeEpoch: at(6, 10),
      takeoffTimeEpoch: at(6, 10) + 5 * MINUTE,
      landingTimeEpoch: at(6, 12) + 45 * MINUTE,
      onBlockTimeEpoch: at(6, 12) + 50 * MINUTE,
    })

    await insertBookingRow({
      bookingId: 'effCanc',
      memberId: 'Matti1',
      registration: 'OH-STL',
      startTimeEpoch: at(7, 9),
      endTimeEpoch: at(7, 12),
      bookingStatus: BookingStatus.CANCELLED,
      cancelledAt: new Date((at(7, 9) - 90 * MINUTE) * 1000),
      cancellationReason: CancellationReason.WEATHER_DEPARTURE,
      cancellationNote: 'Fog at EFHF',
    })

    await insertBookingRow({
      bookingId: 'effNoFly',
      memberId: 'Matti1',
      registration: 'OH-STL',
      startTimeEpoch: at(8, 9),
      endTimeEpoch: at(8, 11),
    })

    // Another member, so the club figure is not simply the member's own.
    await insertBookingRow({
      bookingId: 'effOther',
      memberId: 'Liisa1',
      registration: 'OH-STL',
      startTimeEpoch: at(9, 9),
      endTimeEpoch: at(9, 11),
    })
    await insertFlightRow({
      flightId: 'efFOther',
      memberId: 'Liisa1',
      registration: 'OH-STL',
      ajlbSeqNo: 1,
      offBlockTimeEpoch: at(9, 9),
      takeoffTimeEpoch: at(9, 9) + 5 * MINUTE,
      landingTimeEpoch: at(9, 10) + 55 * MINUTE,
      onBlockTimeEpoch: at(9, 11),
    })

    // A month earlier, so it must never appear in a June window.
    await insertBookingRow({
      bookingId: 'effPrev',
      memberId: 'Matti1',
      registration: 'OH-STL',
      startTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 9, 0, 0) / 1000),
      endTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 12, 0, 0) / 1000),
    })
    await insertFlightRow({
      flightId: 'efFPrev',
      memberId: 'Matti1',
      registration: 'OH-STL',
      ajlbSeqNo: 1,
      offBlockTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 9, 0, 0) / 1000),
      takeoffTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 9, 5, 0) / 1000),
      landingTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 11, 55, 0) / 1000),
      onBlockTimeEpoch: Math.floor(Date.UTC(2018, 4, 5, 12, 0, 0) / 1000),
    })
  })

  afterAll(async () => {
    await db.deleteFrom('flight.logsAudit').where('flightId', 'in', FLIGHT_IDS).execute()
    await db.deleteFrom('flight.logs').where('flightId', 'in', FLIGHT_IDS).execute()
    await db.deleteFrom('schedule.bookings').where('bookingId', 'in', BOOKING_IDS).execute()
  })

  describe('permissions', () => {
    it('should return 401 for an invalid token', async () => {
      const res = await request(app)
        .get('/members/Matti1/reservation-efficiency')
        .set('Cookie', 'accessToken=badToken')

      expect(res.status).toBe(HttpStatusCode.Unauthorized)
    })

    it('should return 403 for an ordinary member', async () => {
      const res = await queryEfficiency(memberToken)

      expect(res.status).toBe(HttpStatusCode.Forbidden)
    })

    it('should not let a member read their own report without MEMBER_ADMIN', async () => {
      const res = await queryEfficiency(noPermissionsToken, 'Liisa1')

      expect(res.status).toBe(HttpStatusCode.Forbidden)
    })

    it('should return 200 for a members admin', async () => {
      const res = await queryEfficiency(adminToken)

      expect(res.status).toBe(HttpStatusCode.Ok)
    })
  })

  describe('validation', () => {
    it('should return 404 for a member who does not exist', async () => {
      const res = await queryEfficiency(adminToken, 'Iceman99')

      expect(res.status).toBe(HttpStatusCode.NotFound)
    })

    it('should return 400 for a malformed date', async () => {
      const res = await queryEfficiency(adminToken, 'Matti1', { from: '01.06.2018' })

      expect(res.status).toBe(HttpStatusCode.BadRequest)
    })

    it('should return 400 when from is after to', async () => {
      const res = await queryEfficiency(adminToken, 'Matti1', {
        from: WINDOW_TO,
        to: WINDOW_FROM,
      })

      expect(res.status).toBe(HttpStatusCode.BadRequest)
    })

    it('should default to the last twelve months when no window is given', async () => {
      const res = await queryEfficiency(adminToken, 'Matti1', {})

      expect(res.status).toBe(HttpStatusCode.Ok)
      const body = res.body as MemberEfficiencyResponse
      const years = (Date.parse(body.to) - Date.parse(body.from)) / (1000 * 60 * 60 * 24 * 365)
      expect(years).toBeCloseTo(1, 1)
      expect(body.entries.some((entry) => entry.bookingId === 'effTidy')).toBe(false)
    })
  })

  describe('the report', () => {
    let body: MemberEfficiencyResponse

    beforeAll(async () => {
      const res = await queryEfficiency(adminToken)
      body = res.body as MemberEfficiencyResponse
    })

    it('should cover only the bookings inside the window, newest first', () => {
      expect(body.entries.map((entry) => entry.bookingId)).toEqual([
        'effNoFly',
        'effCanc',
        'effLate',
        'effTidy',
      ])
    })

    it('should match a flight to the booking it was flown under', () => {
      expect(entryFor(body, 'effTidy')).toMatchObject({
        registration: 'OH-STL',
        status: BookingStatus.CONFIRMED,
        reservedMins: 180,
        flightMins: 150,
        flightCount: 1,
        efficiencyPct: 83.33,
        headGapMins: 10,
        tailGapMins: 10,
        isUnderused: false,
      })
    })

    it('should flag the booking that sat on the ground for an hour', () => {
      expect(entryFor(body, 'effLate')).toMatchObject({
        reservedMins: 240,
        flightMins: 160,
        headGapMins: 60,
        tailGapMins: 10,
        isUnderused: true,
      })
    })

    it('should surface the cancellation with its reason and notice period', () => {
      expect(entryFor(body, 'effCanc')).toMatchObject({
        status: BookingStatus.CANCELLED,
        flightMins: 0,
        efficiencyPct: 0,
        isUnderused: false,
        cancellationReason: CancellationReason.WEATHER_DEPARTURE,
        cancellationNote: 'Fog at EFHF',
        cancelledNoticeHours: 1.5,
      })
    })

    it('should show a booking nobody flew as a no-show', () => {
      expect(entryFor(body, 'effNoFly')).toMatchObject({
        reservedMins: 120,
        flightCount: 0,
        efficiencyPct: 0,
      })
    })

    it('should never attribute a booking made by someone else to this member', () => {
      expect(body.entries.some((entry) => entry.bookingId === 'effOther')).toBe(false)
    })

    it('should summarise the member on non-cancelled reserved time only', () => {
      expect(body.summary).toMatchObject({
        bookingCount: 4,
        cancelledCount: 1,
        underusedCount: 1,
        noShowCount: 1,
        totalReservedMins: 540,
        totalFlightMins: 310,
        memberEfficiencyPct: 57.41,
      })
    })

    it('should compare against the whole club over the same window', () => {
      // 150 + 160 + 110 flown out of 180 + 240 + 120 + 120 reserved.
      expect(body.summary.clubEfficiencyPct).toBe(63.64)
      expect(body.memberId).toBe('Matti1')
      expect(body.from).toBe(WINDOW_FROM)
    })
  })
})
