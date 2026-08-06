import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/defects/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/defects', router)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const OTHER_AIRCRAFT = 'OH-IHQ'
const AJLB_SEQ_NO = 1
const TEST_MARKER = 'DEFECT-TEST'
// OH-STL/1's last validated flight total (test data) is 21301 -- flightMins
// sent through the (guarded) HTTP API for a real create must be safely past
// that live-region baseline, or the request is rejected with 400.
const LIVE_FLIGHT_MINS = 900000

const adminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
  canMakeReservations: false,
})

const ownerToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const otherUserToken = generateAccessToken({
  memberId: 'Erkki1',
  lastName: 'Erkkinen',
  email: 'erkki@mik.fi',
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

const createdDefectIds: string[] = []
const createdHilIds: string[] = []
const createdNoteIds: string[] = []

const insertHil = async (aircraftRegistration: string, hilNumber: number): Promise<string> => {
  const now = new Date()
  const row = await db
    .insertInto('flight.aircraft_hil')
    .values({
      aircraft_registration: aircraftRegistration,
      hil_number: hilNumber,
      source_ref: `${TEST_MARKER} ref`,
      defect_cat: 'B',
      description: `${TEST_MARKER} landing light inoperative`,
      restrictions: null,
      open_date: now,
      name: 'Plane Captain',
      due_date: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      resolved_note_id: null,
      created_at: now,
      created_by: 'Matti1',
      updated_at: now,
      updated_by: 'Matti1',
    })
    .returning('hil_id')
    .executeTakeFirstOrThrow()
  createdHilIds.push(row.hil_id)
  return row.hil_id
}

const insertNote = async (aircraftRegistration: string): Promise<string> => {
  const row = await db
    .insertInto('flight.maintenance_note')
    .values({
      aircraft_registration: aircraftRegistration,
      ajlb_seq_no: AJLB_SEQ_NO,
      description: `${TEST_MARKER} note`,
      performed_by: 'AME',
      flight_mins: 50,
      blank_rows_after: 0,
      created_at: new Date(),
      created_by: 'Matti1',
    })
    .returning('note_id')
    .executeTakeFirstOrThrow()
  createdNoteIds.push(row.note_id)
  return row.note_id
}

const cleanup = async () => {
  if (createdDefectIds.length) {
    await db.deleteFrom('flight.defect').where('defect_id', 'in', createdDefectIds).execute()
    createdDefectIds.length = 0
  }
  if (createdHilIds.length) {
    await db.deleteFrom('flight.aircraft_hil').where('hil_id', 'in', createdHilIds).execute()
    createdHilIds.length = 0
  }
  if (createdNoteIds.length) {
    await db.deleteFrom('flight.maintenance_note').where('note_id', 'in', createdNoteIds).execute()
    createdNoteIds.length = 0
  }
}

beforeEach(cleanup)
afterAll(cleanup)

describe('GET /defects', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .get('/defects')
      .set('Cookie', 'accessToken=INVALID')
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .get('/defects')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(403)
  })

  it('lists defects for the whole aircraft when ajlbSeqNo is omitted', async () => {
    const res = await request(app)
      .get('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /defects', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app).post('/defects').set('Cookie', 'accessToken=INVALID').send({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      description: 'test',
      flightMins: 100,
    })

    expect(res.status).toBe(401)
  })

  it('creates a standalone defect with no flightId', async () => {
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} tire worn under the limits`,
        flightMins: LIVE_FLIGHT_MINS,
        // The frontend always sends an explicit rows value (1 for a
        // standalone/pre-flight defect); the schema also defaults to 1 here
        // when a caller omits it entirely, see the next test.
        rows: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      aircraftRegistration: AIRCRAFT,
      flightId: null,
      status: 'ACTIVE',
      createdBy: 'Liisa1',
      rows: 1,
    })
    createdDefectIds.push(res.body.defectId)
  })

  it('defaults rows to 1 (own row) when omitted for a pre-flight defect (no flightId)', async () => {
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} defect with no explicit rows`,
        flightMins: LIVE_FLIGHT_MINS,
      })

    expect(res.status).toBe(201)
    expect(res.body.rows).toBe(1)
    createdDefectIds.push(res.body.defectId)
  })

  it('defaults rows to 0 (inline chip) for an in-flight defect', async () => {
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        flightId: 'mass1',
        description: `${TEST_MARKER} in-flight defect`,
        flightMins: LIVE_FLIGHT_MINS,
      })

    expect(res.status).toBe(201)
    expect(res.body.rows).toBe(0)
    createdDefectIds.push(res.body.defectId)
  })

  it('returns 400 when rows is 0 and blankRowsAfter is non-zero', async () => {
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} invalid inline defect`,
        flightMins: LIVE_FLIGHT_MINS,
        rows: 0,
        blankRowsAfter: 1,
      })

    expect(res.status).toBe(400)
  })

  it('returns 400 when flightMins is at or before the last validated flight', async () => {
    // OH-STL/1's last validated flight total is 21301 in the test data.
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} backdated defect`,
        flightMins: 21301,
      })

    expect(res.status).toBe(400)
  })
})

describe('PATCH /defects/:id', () => {
  let defectId: string

  beforeEach(async () => {
    const res = await request(app)
      .post('/defects')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} defect`,
        flightMins: LIVE_FLIGHT_MINS,
        rows: 0,
      })
    defectId = res.body.defectId
    createdDefectIds.push(defectId)
  })

  it('returns 404 when a non-owner, non-admin tries to edit', async () => {
    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${otherUserToken}`)
      .send({ description: 'edited by someone else' })

    expect(res.status).toBe(404)
  })

  it('lets the owner edit the description', async () => {
    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ description: 'edited by owner' })

    expect(res.status).toBe(200)
    expect(res.body.description).toBe('edited by owner')
  })

  it('returns 400 for blankRowsAfter when the persisted rows is 0 (rows is not PATCH-able)', async () => {
    // The beforeEach POST explicitly sends rows: 0.
    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ blankRowsAfter: 2 })

    expect(res.status).toBe(400)
  })

  it('returns 403 when a non-admin tries to resolve a defect', async () => {
    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ resolvedNoteId: '00000000-0000-0000-0000-000000000000' })

    expect(res.status).toBe(403)
  })

  it('returns 403 when a non-admin tries to link a hold item, even on their own defect', async () => {
    const hilId = await insertHil(AIRCRAFT, 9105)

    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ hilId })

    expect(res.status).toBe(403)
  })

  it('rejects changing the hold item link on a resolved defect', async () => {
    const noteId = await insertNote(AIRCRAFT)
    await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ resolvedNoteId: noteId })

    const hilId = await insertHil(AIRCRAFT, 9106)
    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ hilId })

    expect(res.status).toBe(400)
  })

  it('rejects linking to a hold item that belongs to a different aircraft', async () => {
    const hilId = await insertHil(OTHER_AIRCRAFT, 9101)

    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ hilId })

    expect(res.status).toBe(400)
  })

  it('links to a hold item on the same aircraft', async () => {
    const hilId = await insertHil(AIRCRAFT, 9102)

    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ hilId })

    expect(res.status).toBe(200)
    expect(res.body.hilId).toBe(hilId)
    expect(res.body.status).toBe('MOVED_TO_HIL')
  })

  it('rejects resolving with a maintenance note that belongs to a different aircraft', async () => {
    const noteId = await insertNote(OTHER_AIRCRAFT)

    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ resolvedNoteId: noteId })

    expect(res.status).toBe(400)
  })

  it('resolves with a maintenance note on the same aircraft', async () => {
    const noteId = await insertNote(AIRCRAFT)

    const res = await request(app)
      .patch(`/defects/${defectId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ resolvedNoteId: noteId })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('RESOLVED')
  })

  it('returns 404 for a non-existent defect id', async () => {
    const res = await request(app)
      .patch('/defects/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'ghost update' })

    expect(res.status).toBe(404)
  })
})
