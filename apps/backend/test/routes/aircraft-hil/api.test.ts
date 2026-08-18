import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/aircraft-hil/api.ts'
import type { AircraftHilOverview } from '@mik/contracts/aircraft-hil'
import { createDefect } from '../../../src/db/defect-queries.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/aircraft-hil', router)
app.use(problemErrorHandler)

const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 1
const TEST_MARKER = 'HIL-TEST'
// Hold item numbers at or above this belong to this test file, not to the seeds
const TEST_HIL_NUMBER_FLOOR = 9000

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
  sourceRef?: string
  defectCat?: string | null
  // Explicit null creates a hold item with no due date, which the paper hold
  // item list allows (issue #1120); omitting it defaults to 30 days out.
  dueDate?: Date | null
  resolvedNoteId?: string | null
}): Promise<{ hilId: string }> => {
  const now = new Date()
  const row = await db
    .insertInto('flight.aircraftHil')
    .values({
      aircraftRegistration: AIRCRAFT,
      hilNumber: overrides.hilNumber,
      sourceRef: overrides.sourceRef ?? `${TEST_MARKER} ref`,
      defectCat: overrides.defectCat === undefined ? 'B' : overrides.defectCat,
      description: overrides.description ?? `${TEST_MARKER} landing light inoperative`,
      restrictions: overrides.restrictions ?? 'Day VFR only',
      openDate: now,
      name: 'Plane Captain',
      dueDate:
        overrides.dueDate === undefined
          ? new Date(now.getTime() + 30 * 24 * 3600 * 1000)
          : overrides.dueDate,
      resolvedNoteId: overrides.resolvedNoteId ?? null,
      createdAt: now,
      createdBy: 'Matti1',
      updatedAt: now,
      updatedBy: 'Matti1',
    })
    .returning('hilId')
    .executeTakeFirstOrThrow()

  return { hilId: row.hilId }
}

const cleanup = async () => {
  // source_ref is optional (issue #1120), so tests that leave it null are found
  // by their hil_number instead — every test here uses 9000+, well clear of the
  // seeded hold items.
  const hilIds = (
    await db
      .selectFrom('flight.aircraftHil')
      .select('hilId')
      .where('aircraftRegistration', '=', AIRCRAFT)
      .where((eb) =>
        eb.or([
          eb('sourceRef', 'like', `${TEST_MARKER}%`),
          eb('hilNumber', '>=', TEST_HIL_NUMBER_FLOOR),
        ]),
      )
      .execute()
  ).map((row) => row.hilId)

  if (createdDefectIds.length) {
    await db.deleteFrom('flight.defect').where('defectId', 'in', createdDefectIds).execute()
    createdDefectIds.length = 0
  }

  if (hilIds.length) {
    await db.deleteFrom('flight.defect').where('hilId', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraftHilExtension').where('hilId', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraftHil').where('hilId', 'in', hilIds).execute()
    await db.deleteFrom('flight.aircraftHilAudit').where('hilId', 'in', hilIds).execute()
  }

  // Maintenance notes go last: hold items reference them as the release record
  await db
    .deleteFrom('flight.maintenanceNote')
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
      .insertInto('flight.aircraftHilExtension')
      .values([
        {
          hilId: hilId,
          extensionDate: new Date('2025-12-01T00:00:00.000Z'),
          name: 'Plane Captain',
          extensionDue: new Date('2026-02-01T00:00:00.000Z'),
          createdAt: new Date(),
          createdBy: 'Matti1',
        },
        {
          hilId: hilId,
          extensionDate: new Date('2026-01-15T00:00:00.000Z'),
          name: 'Plane Captain',
          extensionDue: new Date('2026-04-01T00:00:00.000Z'),
          createdAt: new Date(),
          createdBy: 'Matti1',
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
      .insertInto('flight.aircraftHilExtension')
      .values({
        hilId: hilId,
        extensionDate: new Date('2026-01-10T00:00:00.000Z'),
        name: 'Plane Captain',
        extensionDue: new Date('2025-12-15T00:00:00.000Z'),
        createdAt: new Date(),
        createdBy: 'Matti1',
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
      .insertInto('flight.aircraftHilExtension')
      .values([
        {
          hilId: hilId,
          extensionDate: new Date('2025-12-01T00:00:00.000Z'),
          name: 'Plane Captain',
          extensionDue: new Date('2026-06-01T00:00:00.000Z'),
          createdAt: new Date(),
          createdBy: 'Matti1',
        },
        {
          hilId: hilId,
          extensionDate: new Date('2026-01-15T00:00:00.000Z'),
          name: 'Plane Captain',
          extensionDue: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date(),
          createdBy: 'Matti1',
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
        rows: 1,
        blankRowsBefore: 0,
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
        rows: 1,
        blankRowsBefore: 0,
      },
      'Matti1',
    )
    createdDefectIds.push(defect.defectId)
    await db
      .updateTable('flight.defect')
      .set({ hilId: hilId, status: 'MOVED_TO_HIL' })
      .where('defectId', '=', defect.defectId)
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const item = overviewFor(res.body)?.hil.find((h) => h.hilId === hilId)
    expect(item?.defects[0]).toMatchObject({ defectId: defect.defectId, flightMins: 250 })
  })

  it('never marks a hold item with no due date overdue, and does not ground the aircraft', async () => {
    await insertHil({ hilNumber: 9029, dueDate: null })

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const overview = overviewFor(res.body)
    const item = overview?.hil.find((h) => h.hilNumber === 9029)
    expect(item?.dueDate).toBeNull()
    expect(item?.effectiveDueDate).toBeNull()
    expect(item?.isOverdue).toBe(false)
    expect(overview?.overdueHilCount).toBe(0)
    expect(overview?.isGrounded).toBe(false)
  })

  it('reports a hold item with no defect category or source ref', async () => {
    await insertHil({ hilNumber: 9030, defectCat: null, sourceRef: `${TEST_MARKER} keep` })
    await db
      .updateTable('flight.aircraftHil')
      .set({ sourceRef: null })
      .where('hilNumber', '=', 9030)
      .where('aircraftRegistration', '=', AIRCRAFT)
      .execute()

    const res = await request(app)
      .get('/aircraft-hil/overview')
      .set('Cookie', `accessToken=${aircraftUserToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    const item = overviewFor(res.body)?.hil.find((h) => h.hilNumber === 9030)
    expect(item?.defectCat).toBeNull()
    expect(item?.sourceRef).toBeNull()
  })

  it('hides resolved hold items unless includeResolved is set', async () => {
    const note = await db
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: 100,
        blankRowsBefore: 0,
        createdAt: new Date(),
        createdBy: 'Matti1',
      })
      .returning('noteId')
      .executeTakeFirstOrThrow()

    await insertHil({ hilNumber: 9004, resolvedNoteId: note.noteId })

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
        rows: 1,
        blankRowsBefore: 0,
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
      .where('defectId', '=', defect.defectId)
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
      .select(['hilId', 'status'])
      .where('defectId', '=', defect.defectId)
      .executeTakeFirstOrThrow()

    expect(updated.hilId).toBe(res.body.hilId)
    expect(updated.status).toBe('MOVED_TO_HIL')
  })

  it('creates a hold item with no defect category, source ref or due date', async () => {
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        aircraftRegistration: baseHil.aircraftRegistration,
        description: baseHil.description,
        openDate: baseHil.openDate,
        name: baseHil.name,
        defectId: defect.defectId,
        hilNumber: 9031,
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ hilNumber: 9031 })
    expect(res.body.sourceRef).toBeNull()
    expect(res.body.defectCat).toBeNull()
    expect(res.body.dueDate).toBeNull()
  })

  it('accepts an explicit null for the optional fields', async () => {
    const defect = await createTestDefect()

    const res = await request(app)
      .post('/aircraft-hil')
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        ...baseHil,
        defectId: defect.defectId,
        hilNumber: 9032,
        sourceRef: null,
        defectCat: null,
        dueDate: null,
      })

    expect(res.status).toBe(201)
    expect(res.body.sourceRef).toBeNull()
    expect(res.body.defectCat).toBeNull()
    expect(res.body.dueDate).toBeNull()
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
      .select(['hilId', 'status'])
      .where('defectId', '=', defect.defectId)
      .executeTakeFirstOrThrow()

    expect(updated.hilId).toBe(winner.hilId)
    expect(updated.status).toBe('MOVED_TO_HIL')

    // The loser's transaction (insert + defer) must have rolled back entirely
    const createdEntries = await db
      .selectFrom('flight.aircraftHil')
      .select('hilNumber')
      .where('aircraftRegistration', '=', AIRCRAFT)
      .where('hilNumber', 'in', [9022, 9023])
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

  it('clears the defect category, source ref and due date when set to null', async () => {
    const { hilId } = await insertHil({ hilNumber: 9033 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectCat: null, sourceRef: null, dueDate: null })

    expect(res.status).toBe(200)
    expect(res.body.defectCat).toBeNull()
    expect(res.body.sourceRef).toBeNull()
    expect(res.body.dueDate).toBeNull()
  })

  it('sets the optional fields back again after they were cleared', async () => {
    const { hilId } = await insertHil({ hilNumber: 9034, defectCat: null, dueDate: null })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        defectCat: 'C',
        sourceRef: `${TEST_MARKER} MEL 33-40-1`,
        dueDate: '2027-01-01T00:00:00.000Z',
      })

    expect(res.status).toBe(200)
    expect(res.body.defectCat).toBe('C')
    expect(res.body.sourceRef).toBe(`${TEST_MARKER} MEL 33-40-1`)
    expect(res.body.dueDate).toBe('2027-01-01T00:00:00.000Z')
  })

  it('refuses to clear the due date while an extension still stands', async () => {
    const { hilId } = await insertHil({ hilNumber: 9035 })
    await db
      .insertInto('flight.aircraftHilExtension')
      .values({
        hilId: hilId,
        extensionDate: new Date('2026-02-01T00:00:00.000Z'),
        name: 'Plane Captain',
        extensionDue: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date(),
        createdBy: 'Matti1',
      })
      .execute()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ dueDate: null })

    expect(res.status).toBe(400)

    const unchanged = await db
      .selectFrom('flight.aircraftHil')
      .select('dueDate')
      .where('hilId', '=', hilId)
      .executeTakeFirstOrThrow()
    expect(unchanged.dueDate).not.toBeNull()
  })

  it('rejects a maintenance note that belongs to a different aircraft', async () => {
    const { hilId } = await insertHil({ hilNumber: 9012 })
    const note = await db
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: 'OH-IHQ',
        ajlbSeqNo: 1,
        description: `${TEST_MARKER} wrong aircraft note`,
        performedBy: 'AME',
        flightMins: 50,
        blankRowsBefore: 0,
        createdAt: new Date(),
        createdBy: 'Matti1',
      })
      .returning('noteId')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ resolvedNoteId: note.noteId })

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
        rows: 1,
        blankRowsBefore: 0,
      },
      'Matti1',
    )
    await db
      .updateTable('flight.defect')
      .set({ hilId: hilId, status: 'MOVED_TO_HIL' })
      .where('defectId', '=', defect.defectId)
      .execute()

    const note = await db
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: 65,
        blankRowsBefore: 0,
        createdAt: new Date(),
        createdBy: 'Matti1',
      })
      .returning('noteId')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ resolvedNoteId: note.noteId })

    expect(res.status).toBe(200)
    expect(res.body.resolvedNoteId).toBe(note.noteId)

    const updatedDefect = await db
      .selectFrom('flight.defect')
      .select(['status', 'resolvedNoteId'])
      .where('defectId', '=', defect.defectId)
      .executeTakeFirstOrThrow()
    expect(updatedDefect.status).toBe('RESOLVED')
    expect(updatedDefect.resolvedNoteId).toBe(note.noteId)
  })
})

describe('PATCH /aircraft-hil/:id — changing the deferred defect', () => {
  const addDefect = async (
    description: string,
    flightMins: number,
    aircraftRegistration = AIRCRAFT,
  ) => {
    const defect = await createDefect(
      {
        aircraftRegistration,
        ajlbSeqNo: aircraftRegistration === AIRCRAFT ? AJLB_SEQ_NO : 1,
        description: `${TEST_MARKER} ${description}`,
        flightMins,
        rows: 1,
        blankRowsBefore: 0,
      },
      'Matti1',
    )
    createdDefectIds.push(defect.defectId)
    return defect
  }

  const deferTo = async (defectId: string, hilId: string) => {
    await db
      .updateTable('flight.defect')
      .set({ hilId: hilId, status: 'MOVED_TO_HIL' })
      .where('defectId', '=', defectId)
      .execute()
  }

  const defectState = async (defectId: string) =>
    db
      .selectFrom('flight.defect')
      .select(['hilId', 'status'])
      .where('defectId', '=', defectId)
      .executeTakeFirstOrThrow()

  it('swaps a wrongly picked defect for the right one', async () => {
    const { hilId } = await insertHil({ hilNumber: 9040 })
    const wrong = await addDefect('wrong defect', 300)
    const right = await addDefect('right defect', 310)
    await deferTo(wrong.defectId, hilId)

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [right.defectId] })

    expect(res.status).toBe(200)
    // The unlinked defect goes back to being an open defect, which grounds the
    // aircraft until it is deferred again or released by a maintenance note.
    expect(await defectState(wrong.defectId)).toEqual({ hilId: null, status: 'ACTIVE' })
    expect(await defectState(right.defectId)).toEqual({ hilId: hilId, status: 'MOVED_TO_HIL' })
  })

  it('keeps the defects already linked when they are sent back unchanged', async () => {
    const { hilId } = await insertHil({ hilNumber: 9041 })
    const first = await addDefect('first defect', 320)
    const second = await addDefect('second defect', 330)
    await deferTo(first.defectId, hilId)
    await deferTo(second.defectId, hilId)

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [first.defectId, second.defectId] })

    expect(res.status).toBe(200)
    expect(await defectState(first.defectId)).toEqual({ hilId: hilId, status: 'MOVED_TO_HIL' })
    expect(await defectState(second.defectId)).toEqual({ hilId: hilId, status: 'MOVED_TO_HIL' })
  })

  it('rejects a defect that belongs to a different aircraft', async () => {
    const { hilId } = await insertHil({ hilNumber: 9042 })
    const own = await addDefect('own defect', 340)
    await deferTo(own.defectId, hilId)
    const other = await addDefect('other aircraft defect', 350, 'OH-IHQ')

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [other.defectId] })

    expect(res.status).toBe(400)
    expect(await defectState(own.defectId)).toEqual({ hilId: hilId, status: 'MOVED_TO_HIL' })
  })

  it('rejects a defect that is already resolved', async () => {
    const { hilId } = await insertHil({ hilNumber: 9043 })
    const resolved = await addDefect('resolved defect', 360)
    await db
      .updateTable('flight.defect')
      .set({ status: 'RESOLVED' })
      .where('defectId', '=', resolved.defectId)
      .execute()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [resolved.defectId] })

    expect(res.status).toBe(400)
  })

  it('rejects a defect that is already deferred to another hold item', async () => {
    const { hilId } = await insertHil({ hilNumber: 9044 })
    const { hilId: otherHilId } = await insertHil({ hilNumber: 9045 })
    const taken = await addDefect('taken defect', 370)
    await deferTo(taken.defectId, otherHilId)

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [taken.defectId] })

    expect(res.status).toBe(400)
    expect(await defectState(taken.defectId)).toEqual({
      hilId: otherHilId,
      status: 'MOVED_TO_HIL',
    })
  })

  it('rejects changing the defects of a closed hold item', async () => {
    const note = await db
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: `${TEST_MARKER} release`,
        performedBy: 'AME',
        flightMins: 380,
        blankRowsBefore: 0,
        createdAt: new Date(),
        createdBy: 'Matti1',
      })
      .returning('noteId')
      .executeTakeFirstOrThrow()
    const { hilId } = await insertHil({ hilNumber: 9046, resolvedNoteId: note.noteId })
    const other = await addDefect('post-closure defect', 390)

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [other.defectId] })

    expect(res.status).toBe(400)
  })

  it('leaves a defect resolved directly on an open hold item untouched', async () => {
    const { hilId } = await insertHil({ hilNumber: 9050 })
    const resolvedInPlace = await addDefect('resolved in place', 420)
    const replacement = await addDefect('replacement defect', 430)
    await deferTo(resolvedInPlace.defectId, hilId)
    // Resolved straight from the logbook while the hold item is still open
    await db
      .updateTable('flight.defect')
      .set({ status: 'RESOLVED' })
      .where('defectId', '=', resolvedInPlace.defectId)
      .execute()

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [replacement.defectId] })

    expect(res.status).toBe(200)
    // Not reactivated by being left out of the new set
    expect(await defectState(resolvedInPlace.defectId)).toEqual({
      hilId: hilId,
      status: 'RESOLVED',
    })
    expect(await defectState(replacement.defectId)).toEqual({
      hilId: hilId,
      status: 'MOVED_TO_HIL',
    })
  })

  it('rejects an empty defect list — a hold item must always defer a defect', async () => {
    const { hilId } = await insertHil({ hilNumber: 9047 })

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ defectIds: [] })

    expect(res.status).toBe(400)
  })

  it('rolls back the whole update when the relink fails', async () => {
    const { hilId } = await insertHil({ hilNumber: 9048 })
    const own = await addDefect('rollback defect', 400)
    await deferTo(own.defectId, hilId)
    const other = await addDefect('rollback other aircraft', 410, 'OH-IHQ')

    const res = await request(app)
      .patch(`/aircraft-hil/${hilId}`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({ description: 'Should not be saved', defectIds: [other.defectId] })

    expect(res.status).toBe(400)
    const unchanged = await db
      .selectFrom('flight.aircraftHil')
      .select('description')
      .where('hilId', '=', hilId)
      .executeTakeFirstOrThrow()
    expect(unchanged.description).not.toBe('Should not be saved')
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

  it('rejects an extension for a hold item with no due date', async () => {
    const { hilId } = await insertHil({ hilNumber: 9049, dueDate: null })

    const res = await request(app)
      .post(`/aircraft-hil/${hilId}/extensions`)
      .set('Cookie', `accessToken=${flightLogAdminToken}`)
      .send({
        extensionDate: '2026-02-01T00:00:00.000Z',
        name: 'Plane Captain',
        extensionDue: '2026-04-01T00:00:00.000Z',
      })

    expect(res.status).toBe(400)
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
