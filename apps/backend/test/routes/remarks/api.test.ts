import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/remarks/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/remarks', router)
app.use(problemErrorHandler)

// A real, pre-seeded flight (see sql/schema/testdata/V60__LandingBaselineData.sql) --
// remark_id has an FK to flight.logs, so tests need a genuine flightId.
const FLIGHT_ID = 'mass1'
const OTHER_FLIGHT_ID = 'mass2'
const TEST_MARKER = 'REMARK-TEST'

const ownerToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const noAccessToken = generateAccessToken({
  memberId: 'na',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

const createdRemarkIds: string[] = []

const insertRemark = async (flightId: string, description: string): Promise<string> => {
  const now = new Date()
  const row = await db
    .insertInto('flight.remark')
    .values({
      flightId,
      description,
      createdAt: now,
      createdBy: 'Liisa1',
      updatedAt: now,
      updatedBy: 'Liisa1',
    })
    .returning('remarkId')
    .executeTakeFirstOrThrow()
  createdRemarkIds.push(row.remarkId)
  return row.remarkId
}

const cleanup = async () => {
  if (createdRemarkIds.length) {
    await db.deleteFrom('flight.remark').where('remarkId', 'in', createdRemarkIds).execute()
    createdRemarkIds.length = 0
  }
}

beforeEach(cleanup)
afterAll(cleanup)

describe('GET /remarks', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .get('/remarks')
      .set('Cookie', 'accessToken=INVALID')
      .query({ flightId: FLIGHT_ID })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .get('/remarks')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query({ flightId: FLIGHT_ID })

    expect(res.status).toBe(403)
  })

  it('lists only remarks for the given flight', async () => {
    await insertRemark(FLIGHT_ID, `${TEST_MARKER} oil stain on the ramp, wiped off`)
    await insertRemark(OTHER_FLIGHT_ID, `${TEST_MARKER} unrelated remark on another flight`)

    const res = await request(app)
      .get('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ flightId: FLIGHT_ID })

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      flightId: FLIGHT_ID,
      description: `${TEST_MARKER} oil stain on the ramp, wiped off`,
    })
  })
})

describe('POST /remarks', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app).post('/remarks').set('Cookie', 'accessToken=INVALID').send({
      flightId: FLIGHT_ID,
      description: 'test',
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .post('/remarks')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .send({
        flightId: FLIGHT_ID,
        description: 'test',
      })

    expect(res.status).toBe(403)
  })

  it('creates a remark tied to a flight', async () => {
    const res = await request(app)
      .post('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        flightId: FLIGHT_ID,
        description: `${TEST_MARKER} slight vibration on climb-out`,
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      flightId: FLIGHT_ID,
      description: `${TEST_MARKER} slight vibration on climb-out`,
      createdBy: 'Liisa1',
    })
    createdRemarkIds.push(res.body.remarkId)
  })

  it('rejects a blank description', async () => {
    const res = await request(app)
      .post('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        flightId: FLIGHT_ID,
        description: '   ',
      })

    expect(res.status).toBe(400)
  })

  it('rejects an unknown flightId', async () => {
    const res = await request(app)
      .post('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        flightId: 'no-such-flight',
        description: `${TEST_MARKER} test`,
      })

    expect(res.status).toBe(500)
  })
})

describe('GET /remarks/recent', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app).get('/remarks/recent').set('Cookie', 'accessToken=INVALID')

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .get('/remarks/recent')
      .set('Cookie', `accessToken=${noAccessToken}`)

    expect(res.status).toBe(403)
  })

  it('includes aircraft and takeoff time alongside the most recently created remarks', async () => {
    await insertRemark(FLIGHT_ID, `${TEST_MARKER} recent remark`)

    const res = await request(app)
      .get('/remarks/recent')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ limit: 5 })

    expect(res.status).toBe(200)
    expect(res.body.remarks.length).toBeGreaterThan(0)
    const found = res.body.remarks.find(
      (r: { description: string }) => r.description === `${TEST_MARKER} recent remark`,
    )
    expect(found).toMatchObject({
      flightId: FLIGHT_ID,
      aircraftRegistration: 'OH-STL',
    })
    expect(found.takeoffTimeUtc).toBeTruthy()
  })
})
