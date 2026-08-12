import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import maintenanceNoteRouter from '../../../src/routes/maintenance-notes/api.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import {
  createMaintenanceNote,
  deleteMaintenanceNote,
} from '../../../src/db/maintenance-note-queries.ts'
import { db } from '../../../src/db/connection.ts'
import { createDefect } from '../../../src/db/defect-queries.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/maintenance-notes', maintenanceNoteRouter)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const OTHER_AIRCRAFT = 'OH-IHQ'
const AJLB_SEQ_NO = 1
// OH-STL/1's last validated flight total (test data) is 21301 -- flightMins
// sent through the (guarded) HTTP API for a real create must be safely past
// that live-region baseline, or the request is rejected with 400.
const LIVE_FLIGHT_MINS = 900000

const ownerToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const otherUserToken = generateAccessToken({
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
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

describe('GET /maintenance-notes', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', 'accessToken=INVALID')
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO })

    expect(res.status).toBe(403)
  })

  it('returns 400 when aircraftRegistration is missing', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ ajlbSeqNo: AJLB_SEQ_NO })

    expect(res.status).toBe(400)
  })

  it('returns 200 for the whole aircraft when ajlbSeqNo is omitted', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 400 when ajlbSeqNo is not a positive integer', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: 0 })

    expect(res.status).toBe(400)
  })

  it('returns 200 with empty array when no notes exist', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: AIRCRAFT, ajlbSeqNo: AJLB_SEQ_NO })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /maintenance-notes', () => {
  let createdNoteId: string

  afterEach(async () => {
    if (createdNoteId) {
      await deleteMaintenanceNote(createdNoteId)
      createdNoteId = ''
    }
  })

  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', 'accessToken=INVALID')
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'test',
        performedBy: 'Matti',
        flightMins: 100,
      })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks FLIGHTLOG_USER permission', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'test',
        performedBy: 'Matti',
        flightMins: 100,
      })

    expect(res.status).toBe(403)
  })

  it('returns 403 when user has FLIGHTLOG_USER but not FLIGHTLOG_ADMIN', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'test',
        performedBy: 'Matti',
        flightMins: 100,
      })

    expect(res.status).toBe(403)
  })

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(400)
  })

  it('returns 201 with created note', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Annual inspection',
        performedBy: 'Matti Virtanen',
        flightMins: LIVE_FLIGHT_MINS,
        blankRowsAfter: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      description: 'Annual inspection',
      performedBy: 'Matti Virtanen',
      flightMins: LIVE_FLIGHT_MINS,
      blankRowsAfter: 1,
      createdBy: 'Matti1',
      createdAt: expect.any(String),
      noteId: expect.any(String),
    })

    createdNoteId = res.body.noteId
  })

  it('returns 201 for rows: 0 (renders inline on the anchor flight instead of its own row)', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Inline note',
        performedBy: 'Matti Virtanen',
        flightMins: LIVE_FLIGHT_MINS,
        rows: 0,
      })

    expect(res.status).toBe(201)
    expect(res.body.rows).toBe(0)
    expect(res.body.blankRowsAfter).toBe(0)

    createdNoteId = res.body.noteId
  })

  it('returns 400 when rows is 0 and blankRowsAfter is non-zero', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Invalid inline note',
        performedBy: 'Matti Virtanen',
        flightMins: LIVE_FLIGHT_MINS,
        rows: 0,
        blankRowsAfter: 2,
      })

    expect(res.status).toBe(400)
  })

  it('returns 400 when flightMins is before the last validated flight', async () => {
    // OH-STL/1's last validated flight total is 21301 in the test data.
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Backdated note',
        performedBy: 'Matti Virtanen',
        flightMins: 21300,
      })

    expect(res.status).toBe(400)
  })

  it('creates a note when flightMins exactly matches the last validated flight', async () => {
    // A note isn't tied to any specific flight, so one found before any new flight has
    // flown since the last validated one legitimately matches its total exactly.
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Ramp-found note',
        performedBy: 'Matti Virtanen',
        flightMins: 21301,
      })

    expect(res.status).toBe(201)
    createdNoteId = res.body.noteId
  })

  it('returns 400 when flightMins is before start_flight_mins and nothing is validated yet', async () => {
    // OH-IHQ/1 has no validated flights in the test data, so the baseline is
    // the ajlb's start_flight_mins (2445).
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: OTHER_AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Backdated note',
        performedBy: 'Matti Virtanen',
        flightMins: 2444,
      })

    expect(res.status).toBe(400)
  })

  it('creates a note when flightMins exactly matches start_flight_mins and nothing is validated yet', async () => {
    // OH-IHQ/1 has no validated flights in the test data, so the baseline is
    // the ajlb's start_flight_mins (2445) -- a note found before the very first
    // flight legitimately matches it exactly.
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: OTHER_AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Ramp-found note',
        performedBy: 'Matti Virtanen',
        flightMins: 2445,
      })

    expect(res.status).toBe(201)
    createdNoteId = res.body.noteId
  })
})

describe('POST /maintenance-notes with hilIds', () => {
  const TEST_MARKER = 'NOTE-HIL-TEST'
  let createdNoteId: string
  let hilId: string
  let defectId: string

  const insertHil = async (
    aircraftRegistration: string = AIRCRAFT,
    hilNumber: number = 9101,
  ): Promise<string> => {
    const now = new Date()
    const row = await db
      .insertInto('flight.aircraft_hil')
      .values({
        aircraft_registration: aircraftRegistration,
        hil_number: hilNumber,
        source_ref: `${TEST_MARKER} ref`,
        defect_cat: 'B',
        description: `${TEST_MARKER} landing light inoperative`,
        restrictions: 'Day VFR only',
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
    return row.hil_id
  }

  beforeEach(async () => {
    hilId = await insertHil()
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} nav light`,
        flightMins: 120,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    defectId = defect.defectId
    await db
      .updateTable('flight.defect')
      .set({ hil_id: hilId, status: 'MOVED_TO_HIL' })
      .where('defect_id', '=', defectId)
      .execute()
  })

  afterEach(async () => {
    // aircraft_hil references the note via resolved_note_id, so it must go first
    await db.deleteFrom('flight.defect').where('defect_id', '=', defectId).execute()
    await db.deleteFrom('flight.aircraft_hil').where('hil_id', '=', hilId).execute()
    if (createdNoteId) {
      await deleteMaintenanceNote(createdNoteId)
      createdNoteId = ''
    }
  })

  it('resolves the given hold items and cascades to their defects', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: LIVE_FLIGHT_MINS,
        hilIds: [hilId],
      })

    expect(res.status).toBe(201)
    createdNoteId = res.body.noteId

    const hil = await db
      .selectFrom('flight.aircraft_hil')
      .select('resolved_note_id')
      .where('hil_id', '=', hilId)
      .executeTakeFirstOrThrow()
    expect(hil.resolved_note_id).toBe(createdNoteId)

    const defect = await db
      .selectFrom('flight.defect')
      .select(['status', 'resolved_note_id'])
      .where('defect_id', '=', defectId)
      .executeTakeFirstOrThrow()
    expect(defect.status).toBe('RESOLVED')
    expect(defect.resolved_note_id).toBe(createdNoteId)
  })

  it('does not resolve a hold item (or its defect) belonging to a different aircraft', async () => {
    const otherHilId = await insertHil(OTHER_AIRCRAFT, 9102)
    const otherDefect = await createDefect(
      {
        aircraftRegistration: OTHER_AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} other aircraft nav light`,
        flightMins: 90,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    await db
      .updateTable('flight.defect')
      .set({ hil_id: otherHilId, status: 'MOVED_TO_HIL' })
      .where('defect_id', '=', otherDefect.defectId)
      .execute()

    try {
      const res = await request(app)
        .post('/maintenance-notes')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({
          aircraftRegistration: AIRCRAFT,
          ajlbSeqNo: AJLB_SEQ_NO,
          description: `${TEST_MARKER} release`,
          performedBy: 'AME',
          flightMins: LIVE_FLIGHT_MINS,
          hilIds: [otherHilId],
        })

      expect(res.status).toBe(201)
      createdNoteId = res.body.noteId

      const hil = await db
        .selectFrom('flight.aircraft_hil')
        .select('resolved_note_id')
        .where('hil_id', '=', otherHilId)
        .executeTakeFirstOrThrow()
      expect(hil.resolved_note_id).toBeNull()

      const defect = await db
        .selectFrom('flight.defect')
        .select(['status', 'resolved_note_id'])
        .where('defect_id', '=', otherDefect.defectId)
        .executeTakeFirstOrThrow()
      expect(defect.status).toBe('MOVED_TO_HIL')
      expect(defect.resolved_note_id).toBeNull()
    } finally {
      await db.deleteFrom('flight.defect').where('defect_id', '=', otherDefect.defectId).execute()
      await db.deleteFrom('flight.aircraft_hil').where('hil_id', '=', otherHilId).execute()
    }
  })
})

describe('POST /maintenance-notes with defectIds', () => {
  const TEST_MARKER = 'NOTE-DEFECT-TEST'
  let createdNoteId: string
  let defectId: string
  let otherAircraftDefectId: string

  beforeEach(async () => {
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} oil seepage`,
        flightMins: 140,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    defectId = defect.defectId

    const otherDefect = await createDefect(
      {
        aircraftRegistration: 'OH-IHQ',
        ajlbSeqNo: 1,
        description: `${TEST_MARKER} other aircraft`,
        flightMins: 50,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    otherAircraftDefectId = otherDefect.defectId
  })

  afterEach(async () => {
    await db.deleteFrom('flight.defect').where('defect_id', '=', defectId).execute()
    await db.deleteFrom('flight.defect').where('defect_id', '=', otherAircraftDefectId).execute()
    if (createdNoteId) {
      await deleteMaintenanceNote(createdNoteId)
      createdNoteId = ''
    }
  })

  it('resolves the given defects directly, without a hold item', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: LIVE_FLIGHT_MINS,
        defectIds: [defectId],
      })

    expect(res.status).toBe(201)
    createdNoteId = res.body.noteId

    const defect = await db
      .selectFrom('flight.defect')
      .select(['status', 'resolved_note_id', 'hil_id'])
      .where('defect_id', '=', defectId)
      .executeTakeFirstOrThrow()
    expect(defect.status).toBe('RESOLVED')
    expect(defect.resolved_note_id).toBe(createdNoteId)
    expect(defect.hil_id).toBeNull()
  })

  it('does not resolve a defect belonging to a different aircraft', async () => {
    const res = await request(app)
      .post('/maintenance-notes')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: LIVE_FLIGHT_MINS,
        defectIds: [otherAircraftDefectId],
      })

    expect(res.status).toBe(201)
    createdNoteId = res.body.noteId

    const defect = await db
      .selectFrom('flight.defect')
      .select(['status', 'resolved_note_id'])
      .where('defect_id', '=', otherAircraftDefectId)
      .executeTakeFirstOrThrow()
    expect(defect.status).toBe('ACTIVE')
    expect(defect.resolved_note_id).toBeNull()
  })
})

describe('PATCH /maintenance-notes/:id', () => {
  let noteId: string

  beforeEach(async () => {
    const note = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Pre-patch note',
        performedBy: 'Matti Virtanen',
        flightMins: 200,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    noteId = note.noteId
  })

  afterEach(async () => {
    await deleteMaintenanceNote(noteId)
  })

  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', 'accessToken=INVALID')
      .send({ description: 'updated' })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks permission', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${noAccessToken}`)
      .send({ description: 'updated' })

    expect(res.status).toBe(403)
  })

  it('returns 404 when non-owner tries to update', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${otherUserToken}`)
      .send({ description: 'updated by other' })

    expect(res.status).toBe(404)
  })

  it('returns 200 when owner updates the note', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ description: 'updated by owner' })

    expect(res.status).toBe(200)
    expect(res.body.description).toBe('updated by owner')
  })

  it('returns 200 when admin updates note owned by another user', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'updated by admin' })

    expect(res.status).toBe(200)
    expect(res.body.description).toBe('updated by admin')
  })

  it('returns 200 when flightMins is updated past the last validated flight', async () => {
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ flightMins: LIVE_FLIGHT_MINS })

    expect(res.status).toBe(200)
    expect(res.body.flightMins).toBe(LIVE_FLIGHT_MINS)
  })

  it('returns 400 when flightMins is updated to before the last validated flight', async () => {
    // OH-STL/1's last validated flight total is 21301 in the test data.
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ flightMins: 21300 })

    expect(res.status).toBe(400)
  })

  it('returns 200 when flightMins is updated to exactly the last validated flight', async () => {
    // OH-STL/1's last validated flight total is 21301 in the test data -- a note isn't
    // tied to a specific flight, so this legitimately matches the baseline exactly.
    const res = await request(app)
      .patch(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ flightMins: 21301 })

    expect(res.status).toBe(200)
    expect(res.body.flightMins).toBe(21301)
  })

  it('returns 404 for non-existent note id', async () => {
    const res = await request(app)
      .patch('/maintenance-notes/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ description: 'ghost update' })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /maintenance-notes/:id rows/blankRowsAfter cross-validation', () => {
  it('returns 400 for blankRowsAfter alone when the persisted rows is already 0', async () => {
    const note = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Inline note for PATCH cross-validation',
        performedBy: 'Matti Virtanen',
        flightMins: 200,
        rows: 0,
        blankRowsAfter: 0,
      },
      'Matti1',
    )

    try {
      const res = await request(app)
        .patch(`/maintenance-notes/${note.noteId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ blankRowsAfter: 2 })

      expect(res.status).toBe(400)
    } finally {
      await deleteMaintenanceNote(note.noteId)
    }
  })

  it('returns 400 for rows: 0 alone when the persisted blankRowsAfter is already non-zero', async () => {
    const note = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Note with blankRowsAfter for PATCH cross-validation',
        performedBy: 'Matti Virtanen',
        flightMins: 200,
        rows: 1,
        blankRowsAfter: 2,
      },
      'Matti1',
    )

    try {
      const res = await request(app)
        .patch(`/maintenance-notes/${note.noteId}`)
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ rows: 0 })

      expect(res.status).toBe(400)
    } finally {
      await deleteMaintenanceNote(note.noteId)
    }
  })
})

describe('DELETE /maintenance-notes/:id', () => {
  it('returns 404 — maintenance notes cannot be deleted', async () => {
    const res = await request(app)
      .delete('/maintenance-notes/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(404)
  })
})
