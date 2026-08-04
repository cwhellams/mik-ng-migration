import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/aircraft-hil/api.ts'
import type { AircraftHilOverview } from '../../../src/routes/aircraft-hil/models.ts'
import { createDefect } from '../../../src/db/defect-queries.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/aircraft-hil', router)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 1
const TEST_MARKER = 'HIL-TEST'

const flightLogAdminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
  canMakeReservations: false,
})

const flightLogUserToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

// A plain pilot: may see aircraft details but has no flight-log permissions
const aircraftUserToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_USER],
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

const insertHil = async (overrides: {
  hilNumber: number
  description?: string
  restrictions?: string | null
  dueDate?: Date
  resolvedNoteId?: string | null
}): Promise<{ hilId: string }> => {
  const now = new Date()
  const row = await db
    .insertInto('flight.aircraft_hil')
    .values({
      aircraft_registration: AIRCRAFT,
      hil_number: overrides.hilNumber,
      source_ref: `${TEST_MARKER} ref`,
      defect_cat: 'B',
      description: overrides.description ?? `${TEST_MARKER} landing light inoperative`,
      restrictions: overrides.restrictions ?? 'Day VFR only',
      open_date: now,
      name: 'Plane Captain',
      due_date: overrides.dueDate ?? new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      resolved_note_id: overrides.resolvedNoteId ?? null,
      created_at: now,
      created_by: 'Matti1',
      updated_at: now,
      updated_by: 'Matti1',
    })
    .returning('hil_id')
    .executeTakeFirstOrThrow()

  return { hilId: row.hil_id }
}

const cleanup = async () => {
  const hilIds = (
    await db
      .selectFrom('flight.aircraft_hil')
      .select('hil_id')
      .where('source_ref', 'like', `${TEST_MARKER}%`)
      .execute()
  ).map((row) => row.hil_id)

  if (createdDefectIds.length) {
    await db.deleteFrom('flight.defect').where('defect_id', 'in', createdDefectIds).execute()
    createdDefectIds.length = 0
  }

  if (hilIds.length) {
    await db.deleteFrom('flight.defect').where('hil_id', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraft_hil_extension').where('hil_id', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraft_hil').where('hil_id', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraft_hil_audit').where('hil_id', 'in', hilIds).execute()
  }

  // Maintenance notes go last: hold items reference them as the release record
  await db
    .deleteFrom('flight.maintenance_note')
    .where('description', 'like', `${TEST_MARKER}%`)
    .execute()
}

beforeEach(cleanup)
afterAll(cleanup)

const overviewFor = (body: AircraftHilOverview[]) =>
  body.find((entry) => entry.aircraftRegistration === AIRCRAFT)

describe('GET /aircraft-hil/overview', () => {
  it('returns 401 for invalid JWT', async () => {
    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', 'accessToken=INVALID')

    expect(res.status).toBe(401)
  })

  it('returns 403 when the user has no aircraft or flight-log permissions', async () => {
    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${noAccessToken}`)

    expect(res.status).toBe(403)
  })

  it('is readable by a pilot with only AIRCRAFT_USER permission', async () => {
    await insertHil({ hilNumber: 9001 })

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(200)
    const overview = overviewFor(res.body)
    const entry = overview?.hil.find((h) => h.hilNumber === 9001)
    expect(entry).toMatchObject({
      hilNumber: 9001,
      restrictions: 'Day VFR only',
      defectCat: 'B',
    })
  })

  it('returns the aircraft even when it has no hold items', async () => {
    // OH-STL carries permanent seed hold items (V270__AircraftHilTestData.sql),
    // so use an aircraft with none for this specific assertion.
    const NO_HIL_AIRCRAFT = 'OH-P28'

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: NO_HIL_AIRCRAFT })

    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({
      aircraftRegistration: NO_HIL_AIRCRAFT,
      hil: [],
    })
  })

  it('uses the latest extension as the effective due date', async () => {
    const dueDate = new Date('2026-01-01T00:00:00.000Z')
    const { hilId } = await insertHil({ hilNumber: 9002, dueDate })

    await db
      .insertInto('flight.aircraft_hil_extension')
      .values([
        {
          hil_id: hilId,
          extension_date: new Date('2025-12-01T00:00:00.000Z'),
          name: 'Plane Captain',
          extension_due: new Date('2026-02-01T00:00:00.000Z'),
          created_at: new Date(),
          created_by: 'Matti1',
        },
        {
          hil_id: hilId,
          extension_date: new Date('2026-01-15T00:00:00.000Z'),
          name: 'Plane Captain',
          extension_due: new Date('2026-04-01T00:00:00.000Z'),
          created_at: new Date(),
          created_by: 'Matti1',
        },
      ])
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${flightLogUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(200)
    const item = overviewFor(res.body)?.hil.find((h) => h.hilNumber === 9002)
    expect(item?.dueDate).toBe(dueDate.toISOString())
    expect(item?.effectiveDueDate).toBe('2026-04-01T00:00:00.000Z')
    expect(item?.extensions).toHaveLength(2)
  })

  it('uses the latest extension even when it shortens the due date', async () => {
    const dueDate = new Date('2026-01-01T00:00:00.000Z')
    const { hilId } = await insertHil({ hilNumber: 9027, dueDate })

    // A correcting extension entered after the original due date, tightening
    // it instead of pushing it out further.
    await db
      .insertInto('flight.aircraft_hil_extension')
      .values({
        hil_id: hilId,
        extension_date: new Date('2026-01-10T00:00:00.000Z'),
        name: 'Plane Captain',
        extension_due: new Date('2025-12-15T00:00:00.000Z'),
        created_at: new Date(),
        created_by: 'Matti1',
      })
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${flightLogUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const item = overviewFor(res.body)?.hil.find((h) => h.hilNumber === 9027)
    expect(item?.effectiveDueDate).toBe('2025-12-15T00:00:00.000Z')
  })

  it('picks the extension with the latest extension_date, not the latest extension_due', async () => {
    const dueDate = new Date('2026-01-01T00:00:00.000Z')
    const { hilId } = await insertHil({ hilNumber: 9028, dueDate })

    await db
      .insertInto('flight.aircraft_hil_extension')
      .values([
        {
          hil_id: hilId,
          extension_date: new Date('2025-12-01T00:00:00.000Z'),
          name: 'Plane Captain',
          extension_due: new Date('2026-06-01T00:00:00.000Z'),
          created_at: new Date(),
          created_by: 'Matti1',
        },
        {
          hil_id: hilId,
          extension_date: new Date('2026-01-15T00:00:00.000Z'),
          name: 'Plane Captain',
          extension_due: new Date('2026-03-01T00:00:00.000Z'),
          created_at: new Date(),
          created_by: 'Matti1',
        },
      ])
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${flightLogUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const item = overviewFor(res.body)?.hil.find((h) => h.hilNumber === 9028)
    // The chronologically later extension (by extension_date) has an earlier
    // extension_due — it should still win over the higher extension_due.
    expect(item?.effectiveDueDate).toBe('2026-03-01T00:00:00.000Z')
  })

  it('marks an overdue hold item and grounds the aircraft', async () => {
    await insertHil({ hilNumber: 9003, dueDate: new Date('2020-01-01T00:00:00.000Z') })

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const overview = overviewFor(res.body)
    expect(overview?.hil.find((h) => h.hilNumber === 9003)?.isOverdue).toBe(true)
    expect(overview?.overdueHilCount).toBe(1)
    expect(overview?.isGrounded).toBe(true)
  })

  it('grounds the aircraft while a defect has no hold item and no maintenance release', async () => {
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} oil leak`,
        flightMins: 100,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    createdDefectIds.push(defect.defectId)

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const overview = overviewFor(res.body)
    expect(overview?.openDefectCount).toBeGreaterThanOrEqual(1)
    expect(overview?.isGrounded).toBe(true)
    expect(overview?.openDefects).toEqual(
      expect.arrayContaining([expect.objectContaining({ defectId: defect.defectId })]),
    )
  })

  it('includes the linked defect flightMins, for deep-linking to its logbook page', async () => {
    const { hilId } = await insertHil({ hilNumber: 9026 })
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} flap indicator`,
        flightMins: 250,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    createdDefectIds.push(defect.defectId)
    await db
      .updateTable('flight.defect')
      .set({ hil_id: hilId, status: 'MOVED_TO_HIL' })
      .where('defect_id', '=', defect.defectId)
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const item = overviewFor(res.body)?.hil.find((h) => h.hilId === hilId)
    expect(item?.defects[0]).toMatchObject({ defectId: defect.defectId, flightMins: 250 })
  })

  it('hides resolved hold items unless includeResolved is set', async () => {
    const note = await db
      .insertInto('flight.maintenance_note')
      .values({
        aircraft_registration: AIRCRAFT,
        ajlb_seq_no: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performed_by: 'AME',
        flight_mins: 100,
        blank_rows_after: 0,
        created_at: new Date(),
        created_by: 'Matti1',
      })
      .returning('note_id')
      .executeTakeFirstOrThrow()

    await insertHil({ hilNumber: 9004, resolvedNoteId: note.note_id })

    const hidden = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })
    expect(overviewFor(hidden.body)?.hil.find((h) => h.hilNumber === 9004)).toBeUndefined()

    const shown = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT, includeResolved: 'true' })
    const shownEntry = overviewFor(shown.body)?.hil.find((h) => h.hilNumber === 9004)
    expect(shownEntry).toBeDefined()
    expect(shownEntry?.isOverdue).toBe(false)
  })
})

describe('POST /aircraft-hil', () => {
  const baseHil = {
    aircraftRegistration: AIRCRAFT,
    sourceRef: `${TEST_MARKER} AJLB 1 / row 12`,
    defectCat: 'B',
    description: 'Landing light inoperative',
    restrictions: 'Day VFR only, no controlled airspace',
    openDate: '2026-07-01T10:00:00.000Z',
    name: 'Plane Captain',
    dueDate: '2026-10-01T10:00:00.000Z',
  }

  const createTestDefect = async (aircraftRegistration = AIRCRAFT) => {
    const defect = await createDefect(
      {
        aircraftRegistration,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} nav light`,
        flightMins: 120,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    createdDefectIds.push(defect.defectId)
    return defect
  }

  it('returns 403 for a flight-log user without admin permission', async () => {
    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogUserToken}`)
      .send({ ...baseHil, defectId: '00000000-0000-0000-0000-000000000000' })

    expect(res.status).toBe(403)
  })

  it('returns 400 when defectId is missing', async () => {
    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send(baseHil)

    expect(res.status).toBe(400)
  })

  it('returns 400 when the defect belongs to a different aircraft', async () => {
    const defect = await createTestDefect('OH-IHQ')

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId })

    expect(res.status).toBe(400)
  })

  it('returns 400 when the defect is already resolved', async () => {
    const defect = await createTestDefect()
    await db
      .updateTable('flight.defect')
      .set({ status: 'RESOLVED' })
      .where('defect_id', '=', defect.defectId)
      .execute()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId })

    expect(res.status).toBe(400)
  })

  it('assigns the next free hil number when none is given', async () => {
    await insertHil({ hilNumber: 9005 })
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      hilNumber: 9006,
      restrictions: 'Day VFR only, no controlled airspace',
      createdBy: 'Matti1',
    })
  })

  it('accepts an explicit hilNumber matching the paper hold item list', async () => {
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId, hilNumber: 9020 })

    expect(res.status).toBe(201)
    expect(res.body.hilNumber).toBe(9020)
  })

  it('returns 409 when the hilNumber is already in use for this aircraft', async () => {
    await insertHil({ hilNumber: 9021 })
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId, hilNumber: 9021 })

    expect(res.status).toBe(409)
  })

  it('defers the originating defect to the new hold item', async () => {
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ ...baseHil, defectId: defect.defectId })

    expect(res.status).toBe(201)

    const updated = await db
      .selectFrom('flight.defect')
      .select(['hil_id', 'status'])
      .where('defect_id', '=', defect.defectId)
      .executeTakeFirstOrThrow()

    expect(updated.hil_id).toBe(res.body.hilId)
    expect(updated.status).toBe('MOVED_TO_HIL')
  })

  it('rejects the loser when two concurrent requests defer the same defect', async () => {
    const defect = await createTestDefect()

    const [first, second] = await Promise.all([
      request(app)
        .post('/aircraft-hil')
        .set('Cookie', `accessToken=${flightLogAdminToken}`)
        .send({ ...baseHil, defectId: defect.defectId, hilNumber: 9022 }),
      request(app)
        .post('/aircraft-hil')
        .set('Cookie', `accessToken=${flightLogAdminToken}`)
        .send({ ...baseHil, defectId: defect.defectId, hilNumber: 9023 }),
    ])

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 400])

    const winner = first.status === 201 ? first.body : second.body
    const updated = await db
      .selectFrom('flight.defect')
      .select(['hil_id', 'status'])
      .where('defect_id', '=', defect.defectId)
      .executeTakeFirstOrThrow()

    expect(updated.hil_id).toBe(winner.hilId)
    expect(updated.status).toBe('MOVED_TO_HIL')

    // The loser's transaction (insert + defer) must have rolled back entirely
    const createdEntries = await db
      .selectFrom('flight.aircraft_hil')
      .select('hil_number')
      .where('aircraft_registration', '=', AIRCRAFT)
      .where('hil_number', 'in', [9022, 9023])
      .execute()
    expect(createdEntries).toHaveLength(1)
  })
})

describe('PATCH /aircraft-hil/:id', () => {
  it('updates the restrictions text', async () => {
    const { hilId } = await insertHil({ hilNumber: 9007 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ restrictions: 'IFR prohibited' })

    expect(res.status).toBe(200)
    expect(res.body.restrictions).toBe('IFR prohibited')
  })

  it('clears the restrictions when set to null', async () => {
    const { hilId } = await insertHil({ hilNumber: 9008 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ restrictions: null })

    expect(res.status).toBe(200)
    expect(res.body.restrictions).toBeNull()
  })

  it('lets a plane captain correct the hilNumber to match the paper list', async () => {
    const { hilId } = await insertHil({ hilNumber: 9022 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ hilNumber: 9023 })

    expect(res.status).toBe(200)
    expect(res.body.hilNumber).toBe(9023)
  })

  it('returns 409 when correcting the hilNumber to one already in use', async () => {
    const { hilId } = await insertHil({ hilNumber: 9024 })
    await insertHil({ hilNumber: 9025 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ hilNumber: 9025 })

    expect(res.status).toBe(409)
  })

  it('rejects a maintenance note that belongs to a different aircraft', async () => {
    const { hilId } = await insertHil({ hilNumber: 9012 })
    const note = await db
      .insertInto('flight.maintenance_note')
      .values({
        aircraft_registration: 'OH-IHQ',
        ajlb_seq_no: 1,
        description: `${TEST_MARKER} wrong aircraft note`,
        performed_by: 'AME',
        flight_mins: 50,
        blank_rows_after: 0,
        created_at: new Date(),
        created_by: 'Matti1',
      })
      .returning('note_id')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ resolvedNoteId: note.note_id })

    expect(res.status).toBe(400)
  })

  it('resolves the hold item and cascades to its linked defect in one transaction', async () => {
    const { hilId } = await insertHil({ hilNumber: 9013 })
    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} cascade defect`,
        flightMins: 60,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    await db
      .updateTable('flight.defect')
      .set({ hil_id: hilId, status: 'MOVED_TO_HIL' })
      .where('defect_id', '=', defect.defectId)
      .execute()

    const note = await db
      .insertInto('flight.maintenance_note')
      .values({
        aircraft_registration: AIRCRAFT,
        ajlb_seq_no: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performed_by: 'AME',
        flight_mins: 65,
        blank_rows_after: 0,
        created_at: new Date(),
        created_by: 'Matti1',
      })
      .returning('note_id')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ resolvedNoteId: note.note_id })

    expect(res.status).toBe(200)
    expect(res.body.resolvedNoteId).toBe(note.note_id)

    const updatedDefect = await db
      .selectFrom('flight.defect')
      .select(['status', 'resolved_note_id'])
      .where('defect_id', '=', defect.defectId)
      .executeTakeFirstOrThrow()
    expect(updatedDefect.status).toBe('RESOLVED')
    expect(updatedDefect.resolved_note_id).toBe(note.note_id)
  })
})

describe('GET /aircraft-hil/:id/audit', () => {
  it('returns 403 for a non-admin flight-log user', async () => {
    const { hilId } = await insertHil({ hilNumber: 9009 })

    const res = await request(app)
      .get(`/aircraft-hil/${hilId}/audit`)
      .set('Cookie', `accessToken=${flightLogUserToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 404 for an unknown hold item', async () => {
    const res = await request(app)
      .get('/aircraft-hil/00000000-0000-0000-0000-000000000000/audit')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)

    expect(res.status).toBe(404)
  })

  it('returns the insert and update trail for an admin', async () => {
    const { hilId } = await insertHil({ hilNumber: 9010 })

    await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ description: 'Updated description' })

    const res = await request(app)
      .get(`/aircraft-hil/${hilId}/audit`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.map((entry: { operationType: string }) => entry.operationType)).toEqual(
      expect.arrayContaining(['INSERT', 'UPDATE']),
    )
  })

  it('includes extensions in the change history', async () => {
    const { hilId } = await insertHil({ hilNumber: 9011 })

    await request(app)
      .post(`/aircraft-hil/${hilId}/extensions`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        extensionDate: '2026-02-01T00:00:00.000Z',
        name: 'Plane Captain',
        extensionDue: '2026-04-01T00:00:00.000Z',
      })

    const res = await request(app)
      .get(`/aircraft-hil/${hilId}/audit`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)

    expect(res.status).toBe(200)
    const extensionEntry = res.body.find((entry: { operationType: string }) =>
      entry.operationType.startsWith('EXTENSION_'),
    )
    expect(extensionEntry).toBeDefined()
    expect(extensionEntry.newData).toMatchObject({ name: 'Plane Captain' })
  })
})

describe('POST /aircraft-hil/:id/extensions', () => {
  it('creates the first extension', async () => {
    const { hilId } = await insertHil({ hilNumber: 9012 })

    const res = await request(app)
      .post(`/aircraft-hil/${hilId}/extensions`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        extensionDate: '2026-02-01T00:00:00.000Z',
        name: 'Plane Captain',
        extensionDue: '2026-04-01T00:00:00.000Z',
      })

    expect(res.status).toBe(201)
  })

  it('rejects a second extension for the same hold item', async () => {
    const { hilId } = await insertHil({ hilNumber: 9013 })

    const first = await request(app)
      .post(`/aircraft-hil/${hilId}/extensions`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        extensionDate: '2026-02-01T00:00:00.000Z',
        name: 'Plane Captain',
        extensionDue: '2026-04-01T00:00:00.000Z',
      })
    expect(first.status).toBe(201)

    const second = await request(app)
      .post(`/aircraft-hil/${hilId}/extensions`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        extensionDate: '2026-04-15T00:00:00.000Z',
        name: 'Plane Captain',
        extensionDue: '2026-06-01T00:00:00.000Z',
      })

    expect(second.status).toBe(400)
  })
})
