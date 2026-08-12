import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/dto/api.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/dto', router)
app.use(problemErrorHandler)

// ── Tokens ────────────────────────────────────────────────────────────────────

const juha1Token = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Seppälä',
  email: 'juha@mik.fi',
  roles: [],
  permissions: [MIKPermissions.DTO_USER],
  canMakeReservations: false,
})

const matti1Token = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.DTO_USER],
  canMakeReservations: false,
})

const instructorToken = generateAccessToken({
  memberId: 'Jukka1',
  lastName: 'Korhonen',
  email: 'jukka@mik.fi',
  roles: [],
  permissions: [MIKPermissions.DTO_INSTRUCTOR],
  canMakeReservations: false,
})

const adminToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Admin',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.DTO_ADMIN],
  canMakeReservations: false,
})

const noPermToken = generateAccessToken({
  memberId: 'Anna1',
  lastName: 'Tester',
  email: 'anna@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

// ── Seed data IDs ─────────────────────────────────────────────────────────────

const PROGRAM_ID = 'a0000000-0000-0000-0000-000000000001'
const SYLLABUS_ID = 'b0000000-0000-0000-0000-000000000001' // PUBLISHED v1.0.0
const FLIGHT_01_ID = 'c0000000-0000-0000-0000-000000000001' // Basic Handling
const MS_JUHA1 = 'e0000000-0000-0000-0000-000000000001' // Juha1 member_syllabus
const MS_MATTI1 = 'e0000000-0000-0000-0000-000000000002' // Matti1 member_syllabus
const ATTEMPT_JUHA1_01 = 'f0000000-0000-0000-0000-000000000001' // Juha1 attempt 01 – APPROVED
const FLIGHT_LOG_JUHA1_03 = 'dtoj1f03a' // Juha1 flight 03 – pending (has attempt already)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal flight log row for tests that need a fresh log entry. */
async function insertTestFlightLog(flightId: string, memberId: string) {
  // Use Jan 2026 epochs (same era as seed data, safely in the past)
  await db
    .insertInto('flight.logs')
    .values({
      flight_id: flightId,
      billable_member_id: memberId,
      pic_member_id: memberId,
      pic_last_name: 'Tester',
      pic_role: 'STU' as const,
      aircraft_registration: 'OH-P28',
      off_block_time_epoch: 1768125600,
      takeoff_time_epoch: 1768125660,
      landing_time_epoch: 1768129200,
      on_block_time_epoch: 1768129260,
      fuel_remaining_litres: 20,
      persons_on_board: 2,
      number_of_landings: 1,
      night_flying_mins: 0,
      instrument_flying_mins: 0,
      departure_airport: 'EFHK',
      arrival_airport: 'EFHK',
      flight_type: 'SCHOOL',
      created_by: memberId,
      updated_by: memberId,
      is_billable_flight: false,
      priv_or_com_flight: 'C',
      ajlb_seq_no: 4,
      ajlb_blank_rows_before: 0,
      status: 'NEW',
      is_dto_training_flight: true,
    })
    .execute()
}

async function deleteTestFlightLog(flightId: string) {
  await db.deleteFrom('flight.logs').where('flight_id', '=', flightId).execute()
}

// ── Tests: Training Programs ──────────────────────────────────────────────────

describe('GET /dto/programs', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/dto/programs')
    expect(res.status).toBe(401)
  })

  it('returns 403 without DTO permissions', async () => {
    const res = await request(app).get('/dto/programs').set('Cookie', `accessToken=${noPermToken}`)
    expect(res.status).toBe(403)
  })

  it('returns program list for DTO_USER', async () => {
    const res = await request(app).get('/dto/programs').set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some((p: { programId: string }) => p.programId === PROGRAM_ID)).toBe(true)
  })
})

describe('POST /dto/programs', () => {
  const TEST_PROGRAM_NAME = 'Test Program DTO Suite'

  beforeEach(async () => {
    await db.deleteFrom('dto.training_program').where('name', '=', TEST_PROGRAM_NAME).execute()
  })

  afterEach(async () => {
    await db.deleteFrom('dto.training_program').where('name', '=', TEST_PROGRAM_NAME).execute()
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .post('/dto/programs')
      .set('Cookie', `accessToken=${juha1Token}`)
      .send({ name: 'Should Fail' })
    expect(res.status).toBe(403)
  })

  it('creates a program as DTO_ADMIN', async () => {
    const res = await request(app)
      .post('/dto/programs')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ name: TEST_PROGRAM_NAME, description: 'For testing' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe(TEST_PROGRAM_NAME)
  })
})

// ── Tests: Syllabi ─────────────────────────────────────────────────────────────

describe('GET /dto/syllabi/:syllabusId', () => {
  it('returns syllabus with minBlockTimeMins and recommendedBlockTimeMins', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(res.body.minBlockTimeMins).toBe(2700)
    expect(res.body.flights[0].recommendedBlockTimeMins).toBe(60)
  })

  it('returns 404 for unknown syllabus', async () => {
    const res = await request(app)
      .get('/dto/syllabi/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /dto/syllabi/:syllabusId (update does not wipe minBlockTimeMins)', () => {
  let draftSyllabusId: string

  beforeEach(async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    draftSyllabusId = res.body.syllabusId
    // Set minBlockTimeMins to a known value
    await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'initial', minBlockTimeMins: 1800 })
  })

  afterEach(async () => {
    if (draftSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', draftSyllabusId).execute()
    }
  })

  it('preserves minBlockTimeMins when only description is updated', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'updated description' })
    expect(res.status).toBe(200)
    expect(res.body.minBlockTimeMins).toBe(1800)
  })

  it('clears minBlockTimeMins when explicitly set to null', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'x', minBlockTimeMins: null })
    expect(res.status).toBe(200)
    expect(res.body.minBlockTimeMins).toBeNull()
  })

  it('updates minBlockTimeMins to a new value', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ minBlockTimeMins: 3600 })
    expect(res.status).toBe(200)
    expect(res.body.minBlockTimeMins).toBe(3600)
  })
})

// ── Tests: Approval workflow (submit / withdraw / publish) ────────────────────

describe('POST /dto/syllabi/:syllabusId/submit-for-approval', () => {
  let draftSyllabusId: string

  beforeEach(async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    draftSyllabusId = res.body.syllabusId
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', draftSyllabusId).execute()
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('moves a DRAFT syllabus to WAITING_FOR_APPROVAL and records submittedForApprovalAt', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('WAITING_FOR_APPROVAL')
    expect(res.body.submittedForApprovalAt).toEqual(expect.any(String))
  })

  it('returns 404 when called on the already-published seed syllabus', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('POST /dto/syllabi/:syllabusId/withdraw', () => {
  let draftSyllabusId: string

  beforeEach(async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    draftSyllabusId = res.body.syllabusId
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', draftSyllabusId).execute()
  })

  it('returns 404 when called on a DRAFT syllabus', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/withdraw`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('moves a WAITING_FOR_APPROVAL syllabus back to DRAFT', async () => {
    await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/withdraw`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DRAFT')
  })

  it('returns 404 when called on the already-published seed syllabus', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/withdraw`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('POST /dto/syllabi/:syllabusId/publish', () => {
  // Uses a throwaway training program (not PROGRAM_ID) so the auto-archive
  // test never touches the shared seeded SYLLABUS_ID fixture other tests rely on.
  const TEST_PROGRAM_NAME = 'Test Program DTO Publish Suite'
  let testProgramId: string
  let draftSyllabusId: string

  beforeEach(async () => {
    await db.deleteFrom('dto.training_program').where('name', '=', TEST_PROGRAM_NAME).execute()
    const programRes = await request(app)
      .post('/dto/programs')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ name: TEST_PROGRAM_NAME })
    testProgramId = programRes.body.programId

    const draftRes = await request(app)
      .post(`/dto/programs/${testProgramId}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    draftSyllabusId = draftRes.body.syllabusId
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('program_id', '=', testProgramId).execute()
    await db.deleteFrom('dto.training_program').where('program_id', '=', testProgramId).execute()
  })

  it('returns 404 when publishing directly from DRAFT (approval step is now required)', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/publish`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('publishes from WAITING_FOR_APPROVAL and persists an approvalReference', async () => {
    await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    const res = await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/publish`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ approvalReference: 'AUTH-2026-001' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PUBLISHED')
    expect(res.body.approvalReference).toBe('AUTH-2026-001')
    expect(res.body.publishedAt).toEqual(expect.any(String))
  })

  it('auto-archives the previously PUBLISHED syllabus for the same program', async () => {
    await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    await request(app)
      .post(`/dto/syllabi/${draftSyllabusId}/publish`)
      .set('Cookie', `accessToken=${adminToken}`)

    const secondRes = await request(app)
      .post(`/dto/programs/${testProgramId}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    const secondId = secondRes.body.syllabusId
    await request(app)
      .post(`/dto/syllabi/${secondId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
    const publishRes = await request(app)
      .post(`/dto/syllabi/${secondId}/publish`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(publishRes.status).toBe(200)
    expect(publishRes.body.status).toBe('PUBLISHED')

    const firstAfter = await request(app)
      .get(`/dto/syllabi/${draftSyllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(firstAfter.body.status).toBe('ARCHIVED')
    expect(firstAfter.body.publishedAt).toEqual(expect.any(String))
  })
})

describe('PUT /dto/syllabi/:syllabusId and /flights — WAITING_FOR_APPROVAL guard', () => {
  let syllabusId: string

  beforeEach(async () => {
    const draftRes = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    syllabusId = draftRes.body.syllabusId
    await request(app)
      .post(`/dto/syllabi/${syllabusId}/submit-for-approval`)
      .set('Cookie', `accessToken=${adminToken}`)
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', syllabusId).execute()
  })

  it('PUT /dto/syllabi/:syllabusId returns 404 for a WAITING_FOR_APPROVAL syllabus', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${syllabusId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'should not apply' })
    expect(res.status).toBe(404)
  })

  it('PUT /dto/syllabi/:syllabusId/flights returns 409 for a WAITING_FOR_APPROVAL syllabus', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${syllabusId}/flights`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ flights: [] })
    expect(res.status).toBe(409)
  })
})

// ── Tests: Typo-fix flow on a PUBLISHED syllabus ──────────────────────────────

describe('PATCH /dto/syllabi/:syllabusId/text', () => {
  let testSyllabusId: string
  let testFlightId: string
  let testItemId: string

  beforeEach(async () => {
    const draftRes = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'Original description' })
    testSyllabusId = draftRes.body.syllabusId

    const flightsRes = await request(app)
      .put(`/dto/syllabi/${testSyllabusId}/flights`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flights: [
          {
            code: 'T1',
            name: 'Original flight name',
            description: 'Original flight description',
            items: [
              {
                name: 'Original item name',
                description: 'Original item description',
                mandatory: true,
              },
            ],
          },
        ],
      })
    testFlightId = flightsRes.body.flights[0].flightId
    testItemId = flightsRes.body.flights[0].items[0].itemId

    // Bypass the normal DRAFT -> WAITING_FOR_APPROVAL -> PUBLISHED flow: this
    // test only needs an isolated PUBLISHED syllabus, not the shared seed fixture.
    await db
      .updateTable('dto.syllabus')
      .set({ status: 'PUBLISHED', published_at: new Date() })
      .where('syllabus_id', '=', testSyllabusId)
      .execute()
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', testSyllabusId).execute()
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .patch(`/dto/syllabi/${testSyllabusId}/text`)
      .set('Cookie', `accessToken=${juha1Token}`)
      .send({ description: 'x' })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the syllabus is a DRAFT (typo-fix is PUBLISHED-only)', async () => {
    const draftRes = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    const res = await request(app)
      .patch(`/dto/syllabi/${draftRes.body.syllabusId}/text`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'x' })
    expect(res.status).toBe(404)
    await db
      .deleteFrom('dto.syllabus')
      .where('syllabus_id', '=', draftRes.body.syllabusId)
      .execute()
  })

  it('returns 404 when the syllabus is ARCHIVED', async () => {
    await db
      .updateTable('dto.syllabus')
      .set({ status: 'ARCHIVED' })
      .where('syllabus_id', '=', testSyllabusId)
      .execute()
    const res = await request(app)
      .patch(`/dto/syllabi/${testSyllabusId}/text`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ description: 'x' })
    expect(res.status).toBe(404)
  })

  it('bumps patch_version and applies text corrections without changing IDs or structure', async () => {
    const res = await request(app)
      .patch(`/dto/syllabi/${testSyllabusId}/text`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        description: 'Corrected description',
        flights: [
          {
            flightId: testFlightId,
            name: 'Corrected flight name',
            items: [{ itemId: testItemId, name: 'Corrected item name' }],
          },
        ],
      })
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Corrected description')
    expect(res.body.patchVersion).toBe(1)
    expect(res.body.version).toMatch(/\.1$/)

    const flight = res.body.flights.find((f: { flightId: string }) => f.flightId === testFlightId)
    expect(flight).toBeDefined()
    expect(flight.name).toBe('Corrected flight name')
    // description was not included in the patch payload — must remain unchanged
    expect(flight.description).toBe('Original flight description')
    expect(flight.code).toBe('T1')

    const item = flight.items.find((i: { itemId: string }) => i.itemId === testItemId)
    expect(item).toBeDefined()
    expect(item.name).toBe('Corrected item name')
    expect(item.description).toBe('Original item description')
    expect(item.mandatory).toBe(true)
  })

  it('never writes to a flight/item belonging to a different syllabus, even if referenced by ID', async () => {
    // A second, isolated PUBLISHED syllabus with its own flight/item.
    const foreignDraftRes = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    const foreignSyllabusId = foreignDraftRes.body.syllabusId
    const foreignFlightsRes = await request(app)
      .put(`/dto/syllabi/${foreignSyllabusId}/flights`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flights: [
          {
            code: 'F1',
            name: 'Foreign flight name',
            items: [{ name: 'Foreign item name', mandatory: false }],
          },
        ],
      })
    const foreignFlightId = foreignFlightsRes.body.flights[0].flightId
    const foreignItemId = foreignFlightsRes.body.flights[0].items[0].itemId
    await db
      .updateTable('dto.syllabus')
      .set({ status: 'PUBLISHED', published_at: new Date() })
      .where('syllabus_id', '=', foreignSyllabusId)
      .execute()

    // PATCH testSyllabusId's text but reference the OTHER syllabus's flight/item IDs.
    const res = await request(app)
      .patch(`/dto/syllabi/${testSyllabusId}/text`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flights: [
          {
            flightId: foreignFlightId,
            name: 'Hijacked flight name',
            items: [{ itemId: foreignItemId, name: 'Hijacked item name' }],
          },
        ],
      })
    expect(res.status).toBe(200)
    // testSyllabusId has no flight with foreignFlightId, so nothing in its own response changes
    expect(
      res.body.flights.find((f: { flightId: string }) => f.flightId === foreignFlightId),
    ).toBeUndefined()

    // The foreign syllabus's flight/item text must be completely untouched.
    const foreignFlightRow = await db
      .selectFrom('dto.syllabus_flights')
      .select('name')
      .where('flight_id', '=', foreignFlightId)
      .executeTakeFirst()
    expect(foreignFlightRow?.name).toBe('Foreign flight name')
    const foreignItemRow = await db
      .selectFrom('dto.syllabus_flight_items')
      .select('name')
      .where('item_id', '=', foreignItemId)
      .executeTakeFirst()
    expect(foreignItemRow?.name).toBe('Foreign item name')

    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', foreignSyllabusId).execute()
  })
})

// ── Tests: Flight metadata (flightType, easaFclReference) ─────────────────────

describe('PUT /dto/syllabi/:syllabusId/flights — flightType and easaFclReference', () => {
  let draftSyllabusId: string

  beforeEach(async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({})
    draftSyllabusId = res.body.syllabusId
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', draftSyllabusId).execute()
  })

  it('persists flightType and easaFclReference on a flight', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}/flights`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flights: [
          {
            code: 'X1',
            name: 'XC Flight',
            flightType: 'SOLO_XC',
            easaFclReference: 'FCL.010',
          },
        ],
      })
    expect(res.status).toBe(200)
    expect(res.body.flights[0].flightType).toBe('SOLO_XC')
    expect(res.body.flights[0].easaFclReference).toBe('FCL.010')
  })

  it('returns 400 for an invalid flightType value', async () => {
    const res = await request(app)
      .put(`/dto/syllabi/${draftSyllabusId}/flights`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flights: [{ code: 'X1', name: 'XC Flight', flightType: 'NOT_A_TYPE' }],
      })
    expect(res.status).toBe(400)
  })
})

// ── Tests: Export ──────────────────────────────────────────────────────────────

describe('GET /dto/syllabi/:syllabusId/export', () => {
  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('returns 403 for DTO_INSTRUCTOR', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(403)
  })

  it('returns JSON with title, version, flights, minBlockTimeMins', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.body.title).toBe('PPL(A) DTO Training')
    expect(res.body.version).toBe('1.0.0')
    expect(res.body.minBlockTimeMins).toBe(2700)
  })

  it('export includes recommendedBlockTimeMins for each flight', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    const flight01 = res.body.flights.find((f: { code: string }) => f.code === '01')
    expect(flight01).toBeDefined()
    expect(flight01.recommendedBlockTimeMins).toBe(60)
    const flightXC = res.body.flights.find((f: { code: string }) => f.code === '05')
    expect(flightXC.recommendedBlockTimeMins).toBe(150)
  })

  it('export flights contain items with name and mandatory fields', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${adminToken}`)
    const flight01 = res.body.flights.find((f: { code: string }) => f.code === '01')
    expect(flight01.items).toHaveLength(2)
    expect(flight01.items[0]).toMatchObject({ name: 'Steep turns', mandatory: true })
  })

  it('export JSON re-imports without errors (round-trip)', async () => {
    const exportRes = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(exportRes.status).toBe(200)

    const importRes = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(exportRes.body)), {
        filename: 'roundtrip.json',
        contentType: 'application/json',
      })
    expect(importRes.status).toBe(201)
    expect(importRes.body.minBlockTimeMins).toBe(2700)

    // cleanup imported syllabus
    await db
      .deleteFrom('dto.syllabus')
      .where('syllabus_id', '=', importRes.body.syllabusId)
      .execute()
  })

  it('returns 404 for unknown syllabus', async () => {
    const res = await request(app)
      .get('/dto/syllabi/00000000-0000-0000-0000-000000000000/export')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(404)
  })
})

// ── Tests: Import ──────────────────────────────────────────────────────────────

const validImportJson = {
  title: 'Test Syllabus',
  version: '99.0.0',
  description: 'Test description',
  minBlockTimeMins: 1200,
  flights: [
    {
      code: 'A1',
      name: 'First Flight',
      recommendedBlockTimeMins: 60,
      items: [
        { name: 'Item one', mandatory: true },
        { name: 'Item two', mandatory: false },
      ],
    },
    {
      code: 'VT',
      name: 'Interim Check',
      isInterimCheckpoint: true,
      items: [{ name: 'Decision making', mandatory: true }],
    },
  ],
}

describe('POST /dto/programs/:programId/syllabi/import', () => {
  let importedSyllabusId: string | undefined

  afterEach(async () => {
    if (importedSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', importedSyllabusId).execute()
      importedSyllabusId = undefined
    }
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${juha1Token}`)
      .attach('file', Buffer.from(JSON.stringify(validImportJson)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/No JSON file uploaded/)
  })

  it('returns 400 for non-JSON file content', async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from('not json!!!'), {
        filename: 'bad.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/Invalid JSON/)
  })

  it('returns 400 when required field title is missing', async () => {
    const { title: _title, ...noTitle } = validImportJson
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(noTitle)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/validation failed/)
  })

  it('returns 400 when flights array is empty', async () => {
    const json = { ...validImportJson, flights: [] }
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(json)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
  })

  it('returns 400 when flight codes are not unique', async () => {
    const json = {
      ...validImportJson,
      flights: [
        { code: 'DUP', name: 'First', items: [] },
        { code: 'DUP', name: 'Second', items: [] },
      ],
    }
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(json)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/unique/)
  })

  it('returns 400 when more than one interim checkpoint is present', async () => {
    const json = {
      ...validImportJson,
      flights: [
        { code: 'VT1', name: 'Interim 1', isInterimCheckpoint: true, items: [] },
        { code: 'VT2', name: 'Interim 2', isInterimCheckpoint: true, items: [] },
      ],
    }
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(json)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/interim checkpoint/)
  })

  it('returns 400 when recommendedBlockTimeMins is not a positive integer', async () => {
    const json = {
      ...validImportJson,
      flights: [{ code: 'A1', name: 'Flight', recommendedBlockTimeMins: -5, items: [] }],
    }
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(json)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(400)
  })

  it('creates syllabus from valid JSON and preserves all fields', async () => {
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(validImportJson)), {
        filename: 'syllabus.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(201)
    importedSyllabusId = res.body.syllabusId

    expect(res.body.minBlockTimeMins).toBe(1200)
    expect(res.body.status).toBe('DRAFT')
    expect(res.body.flights).toHaveLength(2)

    const flight = res.body.flights.find((f: { code: string }) => f.code === 'A1')
    expect(flight.recommendedBlockTimeMins).toBe(60)
    expect(flight.items).toHaveLength(2)
  })

  it('imports without optional fields (no minBlockTimeMins, no description)', async () => {
    const minimal = {
      title: 'Minimal Syllabus',
      version: '1.0.0',
      flights: [{ code: 'A1', name: 'Only Flight', items: [] }],
    }
    const res = await request(app)
      .post(`/dto/programs/${PROGRAM_ID}/syllabi/import`)
      .set('Cookie', `accessToken=${adminToken}`)
      .attach('file', Buffer.from(JSON.stringify(minimal)), {
        filename: 'minimal.json',
        contentType: 'application/json',
      })
    expect(res.status).toBe(201)
    importedSyllabusId = res.body.syllabusId
    expect(res.body.minBlockTimeMins).toBeNull()
  })
})

// ── Tests: Copy as Draft ───────────────────────────────────────────────────────

describe('POST /dto/syllabi/:syllabusId/copy', () => {
  let copiedSyllabusId: string | undefined

  afterEach(async () => {
    if (copiedSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabus_id', '=', copiedSyllabusId).execute()
      copiedSyllabusId = undefined
    }
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/copy`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('creates a DRAFT copy of the published syllabus', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/copy`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(201)
    copiedSyllabusId = res.body.syllabusId

    expect(res.body.status).toBe('DRAFT')
    expect(res.body.syllabusId).not.toBe(SYLLABUS_ID)
  })

  it('copy preserves minBlockTimeMins from source', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/copy`)
      .set('Cookie', `accessToken=${adminToken}`)
    copiedSyllabusId = res.body.syllabusId
    expect(res.body.minBlockTimeMins).toBe(2700)
  })

  it('copy preserves recommendedBlockTimeMins on flights', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/copy`)
      .set('Cookie', `accessToken=${adminToken}`)
    copiedSyllabusId = res.body.syllabusId
    const flight01 = res.body.flights.find((f: { code: string }) => f.code === '01')
    expect(flight01.recommendedBlockTimeMins).toBe(60)
  })

  it('copy preserves all flights and their items', async () => {
    const res = await request(app)
      .post(`/dto/syllabi/${SYLLABUS_ID}/copy`)
      .set('Cookie', `accessToken=${adminToken}`)
    copiedSyllabusId = res.body.syllabusId
    expect(res.body.flights).toHaveLength(8)
    const flight01 = res.body.flights.find((f: { code: string }) => f.code === '01')
    expect(flight01.items).toHaveLength(2)
  })
})

// ── Tests: Attempt ownership enforcement ──────────────────────────────────────

describe('POST /dto/flight-logs/:flightLogId/attempt — ownership', () => {
  const TEST_FLIGHT_ID = 'tstflt01'

  beforeEach(async () => {
    await insertTestFlightLog(TEST_FLIGHT_ID, 'Juha1')
  })

  afterEach(async () => {
    await db
      .deleteFrom('dto.syllabus_flight_attempts')
      .where('flight_log_id', '=', TEST_FLIGHT_ID)
      .execute()
    await deleteTestFlightLog(TEST_FLIGHT_ID)
  })

  it('allows DTO_USER to create attempt for their own memberSyllabus', async () => {
    const res = await request(app)
      .post(`/dto/flight-logs/${TEST_FLIGHT_ID}/attempt`)
      .set('Cookie', `accessToken=${juha1Token}`)
      .send({ syllabusFlightId: FLIGHT_01_ID, memberSyllabusId: MS_JUHA1 })
    expect(res.status).toBe(201)
  })

  it('returns 403 when DTO_USER tries to create attempt for another student', async () => {
    // Juha1 attempts to book against Matti1's syllabus assignment
    const res = await request(app)
      .post(`/dto/flight-logs/${TEST_FLIGHT_ID}/attempt`)
      .set('Cookie', `accessToken=${juha1Token}`)
      .send({ syllabusFlightId: FLIGHT_01_ID, memberSyllabusId: MS_MATTI1 })
    expect(res.status).toBe(403)
  })

  it('allows DTO_INSTRUCTOR to create attempt for any member', async () => {
    const res = await request(app)
      .post(`/dto/flight-logs/${TEST_FLIGHT_ID}/attempt`)
      .set('Cookie', `accessToken=${instructorToken}`)
      .send({ syllabusFlightId: FLIGHT_01_ID, memberSyllabusId: MS_JUHA1 })
    expect(res.status).toBe(201)
  })
})

describe('GET /dto/attempts/:attemptId — ownership', () => {
  it('allows Juha1 to read their own attempt', async () => {
    const res = await request(app)
      .get(`/dto/attempts/${ATTEMPT_JUHA1_01}`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(res.body.attemptId).toBe(ATTEMPT_JUHA1_01)
  })

  it('returns 403 when Matti1 tries to read Juha1 attempt', async () => {
    const res = await request(app)
      .get(`/dto/attempts/${ATTEMPT_JUHA1_01}`)
      .set('Cookie', `accessToken=${matti1Token}`)
    expect(res.status).toBe(403)
  })

  it('allows instructor to read any attempt', async () => {
    const res = await request(app)
      .get(`/dto/attempts/${ATTEMPT_JUHA1_01}`)
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(200)
  })

  it('attempt response includes itemOutcomes array', async () => {
    const res = await request(app)
      .get(`/dto/attempts/${ATTEMPT_JUHA1_01}`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.itemOutcomes)).toBe(true)
    expect(res.body.itemOutcomes.length).toBeGreaterThan(0)
  })
})

describe('GET /dto/member-syllabus/:memberSyllabusId/attempts — ownership', () => {
  it('allows student to list their own attempts', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_JUHA1}/attempts`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 403 when Juha1 tries to read Matti1 attempts', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/attempts`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('allows instructor to read any student attempts', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_JUHA1}/attempts`)
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(200)
  })

  it('allows admin to read any student attempts', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/attempts`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
  })
})

// ── Tests: Verified attempt mutation guard (PATCH) ────────────────────────────

describe('PATCH /dto/flight-logs/:flightLogId/attempt — verified guard', () => {
  const FLIGHT_02_ID = 'c0000000-0000-0000-0000-000000000002' // Circuit Training

  it('returns 404 when attempting to reassign a verified attempt', async () => {
    // FLIGHT_LOG_JUHA1_01 (dtoj1f01a) has APPROVED attempt f0000000-...-000001
    const res = await request(app)
      .patch('/dto/flight-logs/dtoj1f01a/attempt')
      .set('Cookie', `accessToken=${instructorToken}`)
      .send({ syllabusFlightId: FLIGHT_02_ID })
    expect(res.status).toBe(404)
  })

  it('reassigns unverified attempt successfully', async () => {
    // dtoj1f03a has pending (unverified) attempt → change to flight 02
    const res = await request(app)
      .patch(`/dto/flight-logs/${FLIGHT_LOG_JUHA1_03}/attempt`)
      .set('Cookie', `accessToken=${instructorToken}`)
      .send({ syllabusFlightId: FLIGHT_02_ID })
    expect(res.status).toBe(200)
    expect(res.body.syllabusFlightId).toBe(FLIGHT_02_ID)

    // restore original flight assignment
    await request(app)
      .patch(`/dto/flight-logs/${FLIGHT_LOG_JUHA1_03}/attempt`)
      .set('Cookie', `accessToken=${instructorToken}`)
      .send({ syllabusFlightId: 'c0000000-0000-0000-0000-000000000003' })
  })

  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .patch('/dto/flight-logs/dtoj1f01a/attempt')
      .set('Cookie', `accessToken=${juha1Token}`)
      .send({ syllabusFlightId: FLIGHT_02_ID })
    expect(res.status).toBe(403)
  })
})

// ── Tests: Student Progress ────────────────────────────────────────────────────

describe('GET /dto/progress', () => {
  it('returns 403 for DTO_USER', async () => {
    const res = await request(app).get('/dto/progress').set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('returns progress list with time tracking fields', async () => {
    const res = await request(app)
      .get('/dto/progress')
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const matti = res.body.find((p: { memberId: string }) => p.memberId === 'Matti1')
    expect(matti).toBeDefined()
    expect(typeof matti.totalBlockTimeMins).toBe('number')
    expect(matti.minBlockTimeMins).toBe(2700)
    expect(typeof matti.meetsTimeRequirement).toBe('boolean')
  })

  it('Matti1 has approved flights and non-zero totalBlockTimeMins', async () => {
    const res = await request(app)
      .get('/dto/progress')
      .set('Cookie', `accessToken=${instructorToken}`)
    const matti = res.body.find((p: { memberId: string }) => p.memberId === 'Matti1')
    expect(matti.totalBlockTimeMins).toBeGreaterThan(0)
    expect(matti.completedFlights).toBeGreaterThan(0)
  })

  it('Juha1 has fewer approved flights than Matti1', async () => {
    const res = await request(app)
      .get('/dto/progress')
      .set('Cookie', `accessToken=${instructorToken}`)
    const juha = res.body.find((p: { memberId: string }) => p.memberId === 'Juha1')
    const matti = res.body.find((p: { memberId: string }) => p.memberId === 'Matti1')
    expect(juha.completedFlights).toBeLessThan(matti.completedFlights)
  })
})

// ── Tests: Progress Detail (N+1 batch regression) ─────────────────────────────

describe('GET /dto/member-syllabus/:memberSyllabusId/detail', () => {
  it('returns 403 for DTO_USER', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/detail`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(403)
  })

  it('returns full detail with attempts and itemOutcomes for each', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/detail`)
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.memberSyllabus).toBeDefined()
    expect(Array.isArray(res.body.attemptsWithOutcomes)).toBe(true)
    expect(res.body.attemptsWithOutcomes.length).toBeGreaterThan(0)
    // Every attempt must have itemOutcomes array
    for (const attempt of res.body.attemptsWithOutcomes) {
      expect(Array.isArray(attempt.itemOutcomes)).toBe(true)
    }
  })

  it('approved attempts include non-empty itemOutcomes', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/detail`)
      .set('Cookie', `accessToken=${instructorToken}`)
    const approved = res.body.attemptsWithOutcomes.filter(
      (a: { verificationResult: string | null }) => a.verificationResult === 'APPROVED',
    )
    expect(approved.length).toBeGreaterThan(0)
    for (const attempt of approved) {
      expect(attempt.itemOutcomes.length).toBeGreaterThan(0)
    }
  })
})

// ── Snapshot tests: student-critical endpoints ────────────────────────────────
//
// These snapshots lock the exact shape and values returned to students and
// instructors so that schema or query changes are caught immediately.
// Timestamp fields are masked with expect.any(String) so the snapshots
// remain stable across test runs.

function maskTimestamps(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(maskTimestamps)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
        [
          'createdAt',
          'updatedAt',
          'verifiedAt',
          'assignedAt',
          'publishedAt',
          'submittedForApprovalAt',
        ].includes(k)
          ? [k, expect.any(String)]
          : [k, maskTimestamps(v)],
      ),
    )
  }
  return obj
}

describe('Snapshot: GET /dto/attempts/:attemptId (student reads own APPROVED attempt)', () => {
  it('matches snapshot', async () => {
    const res = await request(app)
      .get(`/dto/attempts/${ATTEMPT_JUHA1_01}`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(maskTimestamps(res.body)).toMatchSnapshot()
  })
})

describe('Snapshot: GET /dto/member-syllabus/:id/attempts (student reads own attempt list)', () => {
  it('matches snapshot', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_JUHA1}/attempts`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(maskTimestamps(res.body)).toMatchSnapshot()
  })
})

describe('Snapshot: GET /dto/member-syllabus/:id/detail (instructor reads student progress)', () => {
  it('matches snapshot for Matti1', async () => {
    const res = await request(app)
      .get(`/dto/member-syllabus/${MS_MATTI1}/detail`)
      .set('Cookie', `accessToken=${instructorToken}`)
    expect(res.status).toBe(200)
    expect(maskTimestamps(res.body)).toMatchSnapshot()
  })
})

describe('Snapshot: GET /dto/syllabi/:syllabusId (syllabus shape with time fields)', () => {
  it('matches snapshot for published syllabus', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}`)
      .set('Cookie', `accessToken=${juha1Token}`)
    expect(res.status).toBe(200)
    expect(maskTimestamps(res.body)).toMatchSnapshot()
  })
})

describe('Snapshot: GET /dto/syllabi/:syllabusId/export (admin export shape)', () => {
  it('matches snapshot', async () => {
    const res = await request(app)
      .get(`/dto/syllabi/${SYLLABUS_ID}/export`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(maskTimestamps(res.body)).toMatchSnapshot()
  })
})
