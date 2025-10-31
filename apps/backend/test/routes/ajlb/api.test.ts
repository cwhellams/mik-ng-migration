import express from 'express'
import request from 'supertest'

import ajlbRouter from '../../../src/routes/ajlb/api.ts'
import { generateAccessToken, type JWTUser } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { audit, maskAudit } from '../../util/helpers.ts'
import type { AircraftJourneyLogBook } from '../../../src/routes/ajlb/model.ts'
import type { Upsert } from '../../../src/types/schema.ts'
import {
  deleteFlightLog,
  getFlightLogs,
  insertFlightLog,
} from '../../../src/db/flight-log-queries.ts'
import { flightPayload } from '../flight-log/fixtures.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/ajlb', ajlbRouter)
app.use(problemErrorHandler)

const jwt: JWTUser = {
  memberId: 'Liisa1',
  email: 'loggedinuser',
  permissions: [],
}

const memberToken = generateAccessToken({
  ...jwt,
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  ...jwt,
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
})

describe('GET /ajlb', () => {
  it('should get all ajlbs for an admin user', async () => {
    const response = await request(app).get('/ajlb').set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body.books.map(maskAudit)).toMatchSnapshot()
  })

  it('should return 200 for members', async () => {
    const response = await request(app).get('/ajlb').set('Authorization', `Bearer ${memberToken}`)
    expect(response.status).toBe(200)
  })

  it('should return 403 for members', async () => {
    const noAccessToken = generateAccessToken({
      memberId: 'Matti1',
      email: 'jonny.depp@mik.fi',
      permissions: [],
    })

    const response = await request(app).get('/ajlb').set('Authorization', `Bearer ${noAccessToken}`)
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
      .set('Authorization', `Bearer ${adminToken}`)
      .query(badFilter)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/ajlb',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'unrecognized_keys',
          keys: ['someField'],
          message: "Unrecognized key(s) in object: 'someField'",
          path: [],
        },
      ],
    })
  })

  it('should get filtered ajlbs for an admin user', async () => {
    const filter = {
      aircraftRegistration: 'OH-P28',
    }

    const response = await request(app)
      .get('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
      .query(filter)
    expect(response.status).toBe(200)
    expect(response.body.books.map(maskAudit)).toMatchSnapshot()
  })
})

describe('CRUD /ajlb', () => {
  const payload: Upsert<AircraftJourneyLogBook> = {
    aircraftRegistration: 'OH-IHQ',
    seqNo: 3,
    startDate: '2025-06-01',
    endDate: '2026-06-01',
    startFlightMins: 600,
    noOfPages: 10,
    rowsPerPage: 30,
    startPage: 1,
  }

  it('should return 403 for members', async () => {
    const response = await request(app).post('/ajlb').set('Authorization', `Bearer ${memberToken}`)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/ajlb',
      timestamp: expect.any(String),
    })
  })

  it('should create new logbook and move new flights there', async () => {
    await insertFlightLog(
      { ...flightPayload, aircraftRegistration: 'OH-IHQ', picMemberId: jwt.memberId },
      jwt,
    )

    const response = await request(app)
      .post('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
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
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '10:00',
      },
    })
  })

  it('should return 500 for duplicate logbook', async () => {
    const response = await request(app)
      .post('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
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
      .patch('/ajlb/OH-IHQ/3')
      .set('Authorization', `Bearer ${adminToken}`)
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
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '15:00',
      },
    })
  })

  it('should return 500 for deleting logbook with flights', async () => {
    const response = await request(app)
      .delete('/ajlb/OH-IHQ/3')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail:
        'update or delete on table \"aircraft_journey_log_book\" violates foreign key constraint \"fk_ajlb_logs\" on table \"logs\"',
      instance: '/ajlb/OH-IHQ/3',
      timestamp: expect.any(String),
    })
  })

  it('should delete logbook without flights', async () => {
    const logs = await getFlightLogs({ aircraftRegistration: 'OH-IHQ', ajlbSeqNo: 3 })
    for (const log of logs.logs) {
      await deleteFlightLog(log.flightId)
    }

    const response = await request(app)
      .delete('/ajlb/OH-IHQ/3')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({})
  })
})
