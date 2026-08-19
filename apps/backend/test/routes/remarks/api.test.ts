import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/remarks/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { FlightLogStatus } from '@mik/contracts/flight-log'
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

const adminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
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

  it('lists every remark for the given aircraft when scoped by aircraftRegistration', async () => {
    await insertRemark(FLIGHT_ID, `${TEST_MARKER} oil stain on the ramp, wiped off`)
    await insertRemark(OTHER_FLIGHT_ID, `${TEST_MARKER} slight vibration on climb-out`)

    const res = await request(app)
      .get('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      // mass1 and mass2 are both OH-STL, book 1 (see V60__LandingBaselineData.sql)
      .query({ aircraftRegistration: 'OH-STL', ajlbSeqNo: 1 })

    expect(res.status).toBe(200)
    const descriptions = res.body.map((r: { description: string }) => r.description)
    expect(descriptions).toEqual(
      expect.arrayContaining([
        `${TEST_MARKER} oil stain on the ramp, wiped off`,
        `${TEST_MARKER} slight vibration on climb-out`,
      ]),
    )
  })

  it('excludes remarks belonging to a different aircraft', async () => {
    await insertRemark(FLIGHT_ID, `${TEST_MARKER} oil stain on the ramp, wiped off`)

    const res = await request(app)
      .get('/remarks')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: 'OH-IHQ' })

    expect(res.status).toBe(200)
    expect(res.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: `${TEST_MARKER} oil stain on the ramp, wiped off`,
        }),
      ]),
    )
  })

  it('returns 400 when neither flightId nor aircraftRegistration is given', async () => {
    const res = await request(app).get('/remarks').set('Cookie', `accessToken=${ownerToken}`)

    expect(res.status).toBe(400)
  })

  it('allows an admin without FLIGHTLOG_USER to list remarks', async () => {
    const res = await request(app)
      .get('/remarks')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ flightId: FLIGHT_ID })

    expect(res.status).toBe(200)
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

  it('allows an admin without FLIGHTLOG_USER to create a remark', async () => {
    const res = await request(app)
      .post('/remarks')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flightId: FLIGHT_ID,
        description: `${TEST_MARKER} admin-created remark`,
      })

    expect(res.status).toBe(201)
    createdRemarkIds.push(res.body.remarkId)
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

  it('allows an admin without FLIGHTLOG_USER to fetch recent remarks', async () => {
    const res = await request(app).get('/remarks/recent').set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(200)
  })

  it('returns 400 for a non-numeric limit instead of an unhandled 500', async () => {
    const res = await request(app)
      .get('/remarks/recent')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ limit: 'abc' })

    expect(res.status).toBe(400)
  })

  it("filters by status to match the same flight-validation scoping as the dashboard's other list", async () => {
    // mass1 (see V60__LandingBaselineData.sql) has already been bulk-validated;
    // mass199 is deliberately left as NEW.
    await insertRemark(FLIGHT_ID, `${TEST_MARKER} validated-flight remark`)
    await insertRemark('mass199', `${TEST_MARKER} new-flight remark`)

    const res = await request(app)
      .get('/remarks/recent')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ limit: 50, status: FlightLogStatus.NEW })

    expect(res.status).toBe(200)
    const descriptions = res.body.remarks.map((r: { description: string }) => r.description)
    expect(descriptions).toContain(`${TEST_MARKER} new-flight remark`)
    expect(descriptions).not.toContain(`${TEST_MARKER} validated-flight remark`)
  })
})
