import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import maintenanceNoteRouter from '../../../src/routes/maintenance-notes/api.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import {
  createMaintenanceNote,
  deleteMaintenanceNote,
} from '../../../src/db/maintenance-note-queries.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/maintenance-notes', maintenanceNoteRouter)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 1

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

  it('returns 400 when ajlbSeqNo is missing', async () => {
    const res = await request(app)
      .get('/maintenance-notes')
      .set('Cookie', `accessToken=${ownerToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(400)
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
        flightMins: 500,
        blankRowsAfter: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      description: 'Annual inspection',
      performedBy: 'Matti Virtanen',
      flightMins: 500,
      blankRowsAfter: 1,
      createdBy: 'Matti1',
      createdAt: expect.any(String),
      noteId: expect.any(String),
    })

    createdNoteId = res.body.noteId
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

  it('returns 404 for non-existent note id', async () => {
    const res = await request(app)
      .patch('/maintenance-notes/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${ownerToken}`)
      .send({ description: 'ghost update' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /maintenance-notes/:id', () => {
  let noteId: string

  beforeEach(async () => {
    const note = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Pre-delete note',
        performedBy: 'Matti Virtanen',
        flightMins: 300,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    noteId = note.noteId
  })

  afterEach(async () => {
    // best-effort cleanup in case the test did not delete
    await deleteMaintenanceNote(noteId)
  })

  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .delete(`/maintenance-notes/${noteId}`)
      .set('Cookie', 'accessToken=INVALID')

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks permission', async () => {
    const res = await request(app)
      .delete(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${noAccessToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 404 when non-owner tries to delete', async () => {
    const res = await request(app)
      .delete(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${otherUserToken}`)

    expect(res.status).toBe(404)
  })

  it('returns 204 when owner deletes the note', async () => {
    const res = await request(app)
      .delete(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${ownerToken}`)

    expect(res.status).toBe(204)
  })

  it('returns 204 when admin deletes note owned by another user', async () => {
    const res = await request(app)
      .delete(`/maintenance-notes/${noteId}`)
      .set('Cookie', `accessToken=${adminToken}`)

    expect(res.status).toBe(204)
  })

  it('returns 404 for non-existent note id', async () => {
    const res = await request(app)
      .delete('/maintenance-notes/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${ownerToken}`)

    expect(res.status).toBe(404)
  })
})
