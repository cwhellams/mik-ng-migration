import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/flight-log', flightLogRouter)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 1

const userToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
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

describe('GET /flight-log/page-for-mins', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .get('/flight-log/page-for-mins')
      .set('Cookie', 'accessToken=INVALID')
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO, flightMins: 620 })

    expect(res.status).toBe(401)
  })

  it('returns 403 for a user without flight-log permission', async () => {
    const res = await request(app)
      .get('/flight-log/page-for-mins')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO, flightMins: 620 })

    expect(res.status).toBe(403)
  })

  it('returns 400 when required filters are missing', async () => {
    const res = await request(app)
      .get('/flight-log/page-for-mins')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(400)
  })

  it('resolves the page containing the given running-total flight time', async () => {
    const res = await request(app)
      .get('/flight-log/page-for-mins')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO, flightMins: 620 })

    expect(res.status).toBe(200)
    expect(res.body.page).toBe(1)
  })

  it('falls back to the last page for flightMins beyond the last flight', async () => {
    const res = await request(app)
      .get('/flight-log/page-for-mins')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO, flightMins: 999999 })

    expect(res.status).toBe(200)
    expect(res.body.page).toEqual(expect.any(Number))
  })
})
