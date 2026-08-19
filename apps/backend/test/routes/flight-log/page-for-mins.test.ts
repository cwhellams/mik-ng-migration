import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { createDefect } from '../../../src/db/defect-queries.ts'
import { db } from '../../../src/db/connection.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/flight-log', flightLogRouter)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 1
// OH-STL/1's last validated flight total (test data) is 21301 -- an item's
// flightMins must be safely past that live-region baseline to be positioned
// as a live own-row item at all.
const LIVE_FLIGHT_MINS = 900000

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

  it('resolves an own-row item to its exact page from itemType/itemId, not the flightMins heuristic', async () => {
    // A defect's own row can land on a different page than the flightMins-only
    // heuristic would guess, once earlier items on its anchor flight's page
    // have used up that page's remaining rows (see the flight-log-queries.test.ts
    // suite for the exact overflow scenario). This only checks that the route
    // wires itemType/itemId through to the precise lookup instead of dropping
    // them, by cross-checking against the same view it reads from.
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        flightId: null,
        description: 'page-for-mins own-row test',
        flightMins: LIVE_FLIGHT_MINS,
        rows: 1,
      },
      'Matti1',
    )

    try {
      const res = await request(app)
        .get('/flight-log/page-for-mins')
        .set('Cookie', `accessToken=${userToken}`)
        .query({
          aircraftRegistration: AIRCRAFT,
          ajlbSeqNo: AJLB_SEQ_NO,
          flightMins: defect.flightMins,
          itemType: 'defect',
          itemId: defect.defectId,
        })

      expect(res.status).toBe(200)

      const ownRow = await db
        .selectFrom('flight.vwAjlbLiveRows')
        .select('pageNumber')
        .where('itemType', '=', 'defect')
        .where('itemId', '=', defect.defectId)
        .where('isContentRow', '=', true)
        .executeTakeFirstOrThrow()

      expect(res.body.page).toBe(ownRow.pageNumber)
    } finally {
      await db.deleteFrom('flight.defect').where('defectId', '=', defect.defectId).execute()
    }
  })
})
