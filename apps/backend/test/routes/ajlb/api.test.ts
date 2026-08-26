import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import ajlbRouter from '../../../src/routes/ajlb/api.ts'
import { generateAccessToken, type JWTUser } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { audit, maskAudit } from '../../util/helpers.ts'
import type { AircraftJourneyLogBook } from '@mik/contracts/ajlb'
import type { Upsert } from '@mik/contracts/schema'
import { db } from '../../../src/db/connection.ts'
import {
  deleteFlightLog,
  getFlightLogs,
  insertFlightLog,
} from '../../../src/db/flight-log-queries.ts'
import { flightPayload } from '../flight-log/fixtures.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/ajlb', ajlbRouter)
app.use(problemErrorHandler)

const jwt: JWTUser = {
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'loggedinuser',
  roles: [],
  permissions: [],
  canMakeReservations: false,
}

const memberToken = generateAccessToken({
  ...jwt,
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  ...jwt,
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
})

const normalizeAjlbLandingTotals = <T extends Record<string, unknown>>(book: T): T => {
  const view = (book.view ?? {}) as Record<string, unknown>
  return {
    ...book,
    startLandings: typeof book.startLandings === 'number' ? 0 : book.startLandings,
    view: {
      ...view,
      totalLandings: typeof view.totalLandings === 'number' ? 0 : view.totalLandings,
      validatedTotalLandings:
        typeof view.validatedTotalLandings === 'number' ? 0 : view.validatedTotalLandings,
    },
  }
}

describe('GET /ajlb', () => {
  it('should get all ajlbs for an admin user', async () => {
    const response = await request(app).get('/ajlb').set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body.books.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('should return 200 for members', async () => {
    const response = await request(app).get('/ajlb').set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(200)
  })

  it('should return 403 for members', async () => {
    const noAccessToken = generateAccessToken({
      memberId: 'Matti1',
      lastName: 'Test',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [],
      canMakeReservations: false,
    })

    const response = await request(app).get('/ajlb').set('Cookie', `accessToken=${noAccessToken}`)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/ajlb',
      timestamp: expect.any(String),
    })
  })

  it('should return 400 for a bad filter', async () => {
    const badFilter = {
      someField: 'rubbish',
    }
    const response = await request(app)
      .get('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .query(badFilter)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/ajlb',
      timestamp: expect.any(String),
      detail: 'Unrecognized key: "someField"',
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['someField'],
          path: [],
        }),
      ]),
    })
  })

  it('should get filtered ajlbs for an admin user', async () => {
    const filter = {
      aircraftRegistration: 'OH-P28',
    }

    const response = await request(app)
      .get('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .query(filter)
    expect(response.status).toBe(200)
    expect(response.body.books.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })
})

describe('Landing baseline endpoints', () => {
  it('should set baseline and backfill cumulative landing totals across logbooks', async () => {
    const baselineLandings = 100
    const initialAjlbResponse = await request(app)
      .get('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL' })
    const originalBaselineLandings =
      initialAjlbResponse.body.books.find((b: { seqNo: number }) => b.seqNo === 1)?.startLandings ??
      baselineLandings

    const baselineResponse = await request(app)
      .post('/ajlb/OH-STL/baseline')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ baselineLandings })

    expect(baselineResponse.status).toBe(200)
    expect(baselineResponse.body.baseline).toEqual({
      aircraftRegistration: 'OH-STL',
      baselineLandings,
      createdAt: expect.any(String),
      createdBy: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: expect.any(String),
    })

    const ajlbResponse = await request(app)
      .get('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(ajlbResponse.status).toBe(200)
    expect(ajlbResponse.body.books.length).toBeGreaterThanOrEqual(2)
    const previousLogbook = ajlbResponse.body.books.find((b: { seqNo: number }) => b.seqNo === 1)
    const latestLogbook = ajlbResponse.body.books.find((b: { seqNo: number }) => b.seqNo === 2)

    expect(previousLogbook).toMatchObject({
      aircraftRegistration: 'OH-STL',
      seqNo: 1,
      startLandings: 100,
    })
    expect(previousLogbook.view.validatedTotalLandings).toBeGreaterThanOrEqual(100)
    expect(latestLogbook).toMatchObject({
      aircraftRegistration: 'OH-STL',
      seqNo: 2,
      startLandings: previousLogbook.view.validatedTotalLandings,
    })

    const restoreResponse = await request(app)
      .post('/ajlb/OH-STL/baseline')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ baselineLandings: originalBaselineLandings })
    expect(restoreResponse.status).toBe(200)
  })

  it('should return 400 for invalid baseline payload', async () => {
    const response = await request(app)
      .post('/ajlb/OH-STL/baseline')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ baselineLandings: -1 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: 'Invalid baseline landings value',
      instance: '/ajlb/OH-STL/baseline',
      timestamp: expect.any(String),
    })
  })
})

describe('CRUD /ajlb', () => {
  let payload: Upsert<AircraftJourneyLogBook>

  beforeAll(async () => {
    const maxSeqResult = await db
      .selectFrom('flight.aircraftJourneyLogBook')
      .select(({ fn }) => fn.max<number>('seqNo').as('maxSeqNo'))
      .where('aircraftRegistration', '=', 'OH-IHQ')
      .executeTakeFirst()
    const seqNo = (maxSeqResult?.maxSeqNo ?? 0) + 1

    payload = {
      aircraftRegistration: 'OH-IHQ',
      seqNo,
      startDate: '2025-06-01',
      endDate: '2026-06-01',
      startFlightMins: 600,
      startLandings: 0,
      noOfPages: 10,
      rowsPerPage: 30,
      startPage: 1,
    }
  })

  it('should return 403 for members', async () => {
    const response = await request(app).post('/ajlb').set('Cookie', `accessToken=${memberToken}`)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/ajlb',
      timestamp: expect.any(String),
    })
  })

  it('should create new logbook and move new flights there', async () => {
    // V203 adds VALIDATED OH-IHQ flights up to 2025-07-03T11:00Z; use later timestamps
    await insertFlightLog(
      {
        ...flightPayload,
        aircraftRegistration: 'OH-IHQ',
        picMemberId: jwt.memberId,
        offBlockTimeEpoch: (new Date('2025-07-05T10:30:00Z').getTime() / 1000).toString(),
        takeoffTimeEpoch: (new Date('2025-07-05T10:45:00Z').getTime() / 1000).toString(),
        landingTimeEpoch: (new Date('2025-07-05T11:40:00Z').getTime() / 1000).toString(),
        onBlockTimeEpoch: (new Date('2025-07-05T11:45:00Z').getTime() / 1000).toString(),
      },
      jwt,
    )

    const response = await request(app)
      .post('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      ...payload,
      startFlightTime: '10:00',
      ...audit('Liisa1'),
      view: {
        lastPage: 1,
        newFlightsCount: 1,
        newFlightsPage: 1,
        newFlightsTime: '0:55',
        unverifiedTotalFlightTime: '10:55',
        unverifiedTotalFlightMins: 655,
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '10:00',
        validatedTotalLandings: 0,
        totalLandings: 1,
      },
    })
  })

  it('should return 500 for duplicate logbook', async () => {
    const response = await request(app)
      .post('/ajlb')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'duplicate key value violates unique constraint \"pk_ajlb\"',
      instance: '/ajlb',
      timestamp: expect.any(String),
    })
  })

  it('should update logbook', async () => {
    const response = await request(app)
      .patch(`/ajlb/OH-IHQ/${payload.seqNo}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        startFlightMins: 900,
      })

    expect(response.body).toEqual({
      ...payload,
      startFlightMins: 900,
      startFlightTime: '15:00',
      ...audit('Liisa1'),
      view: {
        lastPage: 1,
        newFlightsCount: 1,
        newFlightsPage: 1,
        newFlightsTime: '0:55',
        unverifiedTotalFlightTime: '15:55',
        unverifiedTotalFlightMins: 955,
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '15:00',
        validatedTotalLandings: 0,
        totalLandings: 1,
      },
    })
  })

  it('should return 500 for deleting logbook with flights', async () => {
    const response = await request(app)
      .delete(`/ajlb/OH-IHQ/${payload.seqNo}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail:
        'update or delete on table \"aircraft_journey_log_book\" violates foreign key constraint \"fk_ajlb_logs\" on table \"logs\"',
      instance: `/ajlb/OH-IHQ/${payload.seqNo}`,
      timestamp: expect.any(String),
    })
  })

  it('should delete logbook without flights', async () => {
    const logs = await getFlightLogs({ aircraftRegistration: 'OH-IHQ', ajlbSeqNo: payload.seqNo })
    for (const log of logs.logs) {
      await deleteFlightLog(log.flightId, jwt.memberId)
    }

    const response = await request(app)
      .delete(`/ajlb/OH-IHQ/${payload.seqNo}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({})
  })
})
